import { describe, expect, test } from "bun:test";
import { scrapeHackerNews } from "../../src/scrapers/hackernews";
import { randomUUIDv7 } from "bun";
import { writeFile } from "fs/promises"

describe("HackerNews scraper integration", () => {
    test("scrapes HackerNews articles successfully", async () => {
        const result = await scrapeHackerNews(3);

        if (result.isErr()) {
            console.error("Error:", result.error.message);
        } else {
            console.log(`Scraped ${result.value.length} articles`);
        }

        expect(result.isOk()).toBe(true);

        if (result.isOk()) {
            const articles = result.value;
            expect(articles.length).toBeGreaterThan(0);
            expect(articles.length).toBeLessThanOrEqual(3);

            const article = articles[0]!;
            expect(article.url).toBeDefined();
            expect(article.url).toMatch(/^https?:\/\//);
            expect(article.hnUrl).toBeDefined();
            expect(article.hnUrl).toContain('news.ycombinator.com');
            expect(article.title).toBeDefined();
            expect(article.title).not.toBe('');
            expect(article.domain).toBeDefined();
            expect(article.markdownContent).toBeDefined();
            expect(article.markdownContent.length).toBeGreaterThan(0);

            if (article.markdownContent != null) {
                await writeFile(`/Users/tompiaggio/Documents/Projects/sandbox/personal-news-aggregator/results/${randomUUIDv7()}.md`, article.markdownContent)
            }
        }
    }, { timeout: 45000 });

    test("returns empty array for maxArticles = 0", async () => {
        const result = await scrapeHackerNews(0);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toEqual([]);
        }
    });
});