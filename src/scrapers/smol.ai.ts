import * as cheerio from 'cheerio';
import { ResultAsync, okAsync, errAsync } from "neverthrow";
import { z } from "zod";

const SmolArticleSchema = z.object({
    url: z.string().url(),
    date: z.date(),
    title: z.string(),
    markdownContent: z.string(),
});

export type SmolArticle = z.infer<typeof SmolArticleSchema>;

function htmlToMarkdown(html: string): string {
    const $ = cheerio.load(html);
    let markdown = '';

    const root = $.root();
    const children = root[0]?.children;
    if (!children) {
        return '';
    }

    function processElement(el: any): string {
        if (!el) return '';
        
        if (el.type === 'text') {
            return (el.data || '').trim();
        }

        if (!el.tagName) return '';

        const $el = $(el);
        const text = $el.contents().map((idx: number, child: any) => processElement(child)).get().join('');
        const tagName = el.tagName.toLowerCase();

        switch (tagName) {
            case 'h1':
                return `# ${text}\n\n`;
            case 'h2':
                return `## ${text}\n\n`;
            case 'h3':
                return `### ${text}\n\n`;
            case 'h4':
                return `#### ${text}\n\n`;
            case 'h5':
                return `##### ${text}\n\n`;
            case 'h6':
                return `###### ${text}\n\n`;
            case 'p':
                return `${text}\n\n`;
            case 'a':
                const href = $el.attr('href');
                const linkText = $el.text();
                return href ? `[${linkText}](${href})` : linkText;
            case 'blockquote':
                return `> ${text.split('\n').join('\n> ')}\n\n`;
            case 'ul':
                const ulItems = $el.children('li').map((idx: number, li: any) => {
                    return `- ${processElement(li)}`;
                }).get().join('\n');
                return `${ulItems}\n\n`;
            case 'ol':
                const olItems = $el.children('li').map((idx: number, li: any) => {
                    return `${idx + 1}. ${processElement(li)}`;
                }).get().join('\n');
                return `${olItems}\n\n`;
            case 'strong':
            case 'b':
                return `**${text}**`;
            case 'em':
            case 'i':
                return `*${text}*`;
            case 'code':
                return `\`${$el.text()}\``;
            case 'pre':
                const code = $el.find('code').text() || $el.text();
                return `\`\`\`\n${code}\n\`\`\`\n\n`;
            case 'img':
                const src = $el.attr('src');
                const alt = $el.attr('alt') || '';
                return src ? `![${alt}](${src})\n\n` : '';
            case 'div':
            case 'span':
            case 'section':
                return text;
            default:
                return text;
        }
    }

    for (const child of children) {
        markdown += processElement(child);
    }

    return markdown.trim();
}

function parseDate(dateString: string): Date {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
        return new Date();
    }
    return date;
}

async function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchIssuesList(): ResultAsync<string[], Error> {
    return ResultAsync.fromPromise(
        fetch('https://news.smol.ai/issues/'),
        (error) => new Error(`Failed to fetch issues list: ${error instanceof Error ? error.message : String(error)}`)
    ).andThen((response) =>
        ResultAsync.fromPromise(
            response.text(),
            (error) => new Error(`Failed to read response text: ${error instanceof Error ? error.message : String(error)}`)
        )
    ).map((html) => {
        const $ = cheerio.load(html);
        const issueLinks = $('li a[href^="/issues/"]')
            .map((_: number, element: any) => {
                const href = $(element).attr('href');
                return href ? `https://news.smol.ai${href}` : null;
            })
            .get()
            .filter((url: string | null): url is string => url !== null);

        return issueLinks;
    });
}

function parseIssueHtml(url: string, html: string): SmolArticle | null {
    const $ = cheerio.load(html);

    const title = $('h1').first().text().trim();
    if (!title) {
        return null;
    }

    const dateStr = $('[datetime]').first().attr('datetime');
    const date = dateStr ? parseDate(dateStr) : new Date();

    const contentArea = $('.content-area').first();
    const markdownContent = htmlToMarkdown(contentArea.html() || '');

    const article = {
        url,
        date,
        title,
        markdownContent,
    };

    const parseResult = SmolArticleSchema.safeParse(article);
    if (!parseResult.success) {
        return null;
    }

    return parseResult.data;
}

function fetchIssueContent(url: string): ResultAsync<SmolArticle, Error> {
    return ResultAsync.fromPromise(
        fetch(url),
        (error) => new Error(`Failed to fetch issue ${url}: ${error instanceof Error ? error.message : String(error)}`)
    ).andThen((response) =>
        ResultAsync.fromPromise(
            response.text(),
            (error) => new Error(`Failed to read response text from ${url}: ${error instanceof Error ? error.message : String(error)}`)
        )
    ).map((html) => {
        const article = parseIssueHtml(url, html);
        if (!article) {
            throw new Error(`Failed to parse issue ${url}: no title found`);
        }
        return article;
    });
}

export async function scrapeSmolArticles(maxArticles: number = 10): Promise<ResultAsync<SmolArticle[], Error>> {
    if (maxArticles <= 0) {
        return okAsync([]);
    }

    const issuesListResult = await fetchIssuesList();
    
    if (issuesListResult.isErr()) {
        return errAsync(issuesListResult.error);
    }

    const issueUrls = issuesListResult.value.slice(0, maxArticles);
    const articles: SmolArticle[] = [];
    const errors: Error[] = [];

    for (const url of issueUrls) {
        const result = await fetchIssueContent(url);
        
        if (result.isOk()) {
            articles.push(result.value);
            console.log(`Successfully scraped: ${result.value.title}`);
        } else {
            errors.push(result.error);
            console.error(`Failed to scrape ${url}: ${result.error.message}`);
        }

        await delay(2000);
    }

    if (articles.length === 0) {
        return errAsync(new Error(`Failed to scrape any articles. Errors: ${errors.map(e => e.message).join('; ')}`));
    }

    return okAsync(articles);
}