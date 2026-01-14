import * as cheerio from 'cheerio';
import { chromium } from 'playwright';
import { ResultAsync, okAsync, errAsync } from "neverthrow";
import { z } from "zod";

const HackerNewsArticleSchema = z.object({
    url: z.url(),
    hnUrl: z.url(),
    title: z.string(),
    domain: z.string().optional(),
    markdownContent: z.string(),
});

export type HackerNewsArticle = z.infer<typeof HackerNewsArticleSchema>;

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

function extractDomain(url: string): string | undefined {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname;
    } catch {
        return undefined;
    }
}

async function fetchHackerNewsLinks(): Promise<ResultAsync<Array<{title: string, url: string, hnUrl: string}>, Error>> {
    let browser: any = null;

    try {
        const browserResult = await ResultAsync.fromPromise(
            chromium.launch({ headless: true }),
            (error) => new Error(`Failed to launch browser: ${error instanceof Error ? error.message : String(error)}`)
        );

        if (browserResult.isErr()) {
            return errAsync(browserResult.error);
        }

        browser = browserResult.value;
        const page = await browser.newPage();
        
        const gotoResult = await ResultAsync.fromPromise(
            page.goto('https://news.ycombinator.com/', { waitUntil: 'domcontentloaded' }),
            (error) => new Error(`Failed to load HackerNews: ${error instanceof Error ? error.message : String(error)}`)
        );

        if (gotoResult.isErr()) {
            await page.close();
            await browser.close();
            return errAsync(gotoResult.error);
        }

        const links: Array<{title: string, url: string, hnUrl: string}> = await page.evaluate(() => {
            const storyLinks: Array<{title: string, url: string, hnUrl: string}> = [];
            const anchors = document.querySelectorAll('.titleline > a');
            
            anchors.forEach((anchor: any) => {
                const a = anchor;
                const href = a.href;
                const title = a.textContent || '';
                
                if (href && title && !href.includes('news.ycombinator.com')) {
                    storyLinks.push({
                        title: title.trim(),
                        url: href,
                        hnUrl: window.location.href,
                    });
                }
            });
            
            return storyLinks;
        });

        await page.close();
        await browser.close();
        return okAsync(links);
    } catch (error) {
        try {
            if (browser) {
                await browser.close();
            }
        } catch {}
        return errAsync(error instanceof Error ? error : new Error(String(error)));
    }
}

async function fetchArticleContent(url: string, timeout: number = 15000): Promise<ResultAsync<string, Error>> {
    let browser: any = null;

    try {
        const browserResult = await ResultAsync.fromPromise(
            chromium.launch({ headless: true }),
            (error) => new Error(`Failed to launch browser for ${url}: ${error instanceof Error ? error.message : String(error)}`)
        );

        if (browserResult.isErr()) {
            return errAsync(browserResult.error);
        }

        browser = browserResult.value;
        const page = await browser.newPage();
        
        const gotoResult = await ResultAsync.fromPromise(
            page.goto(url, { waitUntil: 'domcontentloaded', timeout }),
            (error) => new Error(`Failed to load ${url}: ${error instanceof Error ? error.message : String(error)}`)
        );

        if (gotoResult.isErr()) {
            await page.close();
            await browser.close();
            return errAsync(gotoResult.error);
        }

        const htmlResult = await ResultAsync.fromPromise(
            page.content(),
            (error) => new Error(`Failed to get content from ${url}: ${error instanceof Error ? error.message : String(error)}`)
        );

        await page.close();
        await browser.close();

        if (htmlResult.isErr()) {
            return errAsync(htmlResult.error);
        }

        return okAsync(htmlResult.value as string);
    } catch (error) {
        try {
            if (browser) {
                await browser.close();
            }
        } catch {}
        return errAsync(error instanceof Error ? error : new Error(String(error)));
    }
}

function parseArticleHtml(url: string, hnUrl: string, title: string, html: string): HackerNewsArticle | null {
    const markdownContent = htmlToMarkdown(html);
    
    if (!markdownContent || markdownContent.length < 50) {
        return null;
    }

    const article = {
        url,
        hnUrl,
        title,
        domain: extractDomain(url),
        markdownContent,
    };

    const parseResult = HackerNewsArticleSchema.safeParse(article);
    if (!parseResult.success) {
        return null;
    }

    return parseResult.data;
}

export async function scrapeHackerNews(maxArticles: number = 10): Promise<ResultAsync<HackerNewsArticle[], Error>> {
    if (maxArticles <= 0) {
        return okAsync([]);
    }

    console.log('Fetching HackerNews links...');
    const linksResult = await fetchHackerNewsLinks();
    
    if (linksResult.isErr()) {
        return errAsync(linksResult.error);
    }

    const links = linksResult.value.slice(0, maxArticles);
    console.log(`Found ${links.length} articles to scrape`);

    const fetchResults = await Promise.allSettled(
        links.map(async (link) => {
            console.log(`Scraping: ${link.title} (${link.url})`);
            
            const htmlResult = await fetchArticleContent(link.url, 10000);
            
            if (htmlResult.isOk()) {
                const article = parseArticleHtml(link.url, link.hnUrl, link.title, htmlResult.value);
                
                if (article) {
                    console.log(`  ✓ Successfully scraped`);
                    return article;
                } else {
                    console.log(`  ✗ Failed to parse content`);
                    return null;
                }
            } else {
                console.log(`  ✗ ${htmlResult.error.message}`);
                return null;
            }
        })
    );

    const articles: HackerNewsArticle[] = fetchResults
        .map((result) => {
            if (result.status === 'fulfilled' && result.value !== null) {
                return result.value;
            }
            return null;
        })
        .filter((article): article is HackerNewsArticle => article !== null);

    const failedCount = fetchResults.filter(r => r.status === 'rejected').length;
    if (failedCount > 0) {
        console.log(`Failed to fetch ${failedCount} articles (likely timeout or network error)`);
    }

    if (articles.length === 0) {
        return errAsync(new Error(`Failed to scrape any articles. ${failedCount} requests failed.`));
    }

    console.log(`Successfully scraped ${articles.length}/${links.length} articles`);
    return okAsync(articles);
}