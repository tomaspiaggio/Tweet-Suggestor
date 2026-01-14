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

    $('script, style, noscript').remove();

    $('nav, header, footer, aside, .comments, .comment, #comments, .navigation, .breadcrumb').remove();

    function extractText(element: cheerio.Cheerio<any>, depth: number = 0): string {
        let text = '';
        const maxDepth = 50;
        
        if (depth > maxDepth) {
            return text;
        }
        
        element.contents().each((_, child) => {
            if (child.type === 'text') {
                const nodeText = $(child).text().trim();
                if (nodeText.length > 0 && nodeText.length < 10000) {
                    text += nodeText + ' ';
                }
            } else if (child.type === 'tag') {
                const $child = $(child);
                const tagName = child.tagName?.toLowerCase();
                
                if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName || '')) {
                    const level = parseInt(tagName?.replace('h', '') || '0');
                    text += '\n' + '#'.repeat(level) + ' ' + extractText($child, depth + 1).trim() + '\n\n';
                } else if (tagName === 'p') {
                    const paragraphText = extractText($child, depth + 1).trim();
                    if (paragraphText.length > 0) {
                        text += paragraphText + '\n\n';
                    }
                } else if (tagName === 'li') {
                    text += '- ' + extractText($child, depth + 1).trim() + '\n';
                } else if (['ul', 'ol', 'div', 'section', 'blockquote', 'cite', 'strong', 'em', 'span', 'article', 'main'].includes(tagName || '')) {
                    text += extractText($child, depth + 1);
                } else if (tagName === 'a' && $child.attr('href')) {
                    const href = $child.attr('href');
                    const linkText = extractText($child, depth + 1).trim();
                    if (href && !href.includes('javascript:') && !href.includes('#')) {
                        text += `[${linkText}](${href}) `;
                    } else {
                        text += linkText + ' ';
                    }
                } else if (tagName === 'code' && !$child.find('pre').length) {
                    text += '`' + $child.text() + '` ';
                } else if (tagName === 'pre') {
                    const code = $child.find('code').text() || $child.text();
                    if (code.trim().length < 50000) {
                        text += '```\n' + code.trim() + '\n```\n\n';
                    }
                }
            }
        });
        
        return text;
    }

    const markdown = extractText($('body').length ? $('body') : $.root());
    
    return markdown
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && line.length < 50000)
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
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
    const $$ = cheerio.load(html);

    const title = $$('h1').first().text().trim();
    if (!title) {
        return null;
    }

    const dateStr = $$('[datetime]').first().attr('datetime');
    const date = dateStr ? parseDate(dateStr) : new Date();

    const contentArea = $$('.content-area').first().length ? $$('.content-area').first() : 
                        $$('article, main, [role="main"], .content, .article-content, .post-content, .entry-content').first().length ? 
                        $$('article, main, [role="main"], .content, .article-content, .post-content, .entry-content').first() :
                        $$('body').first();
    
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