import { describe, test, expect } from "bun:test";
import { scrapeSmolArticles } from "../../src/scrapers/smol.ai";
import { writeFile } from "fs/promises"

describe("Smol.ai scraper integration", () => {
    test("scrapes smol.ai articles successfully", async () => {
        const result = await scrapeSmolArticles(3);

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
            expect(article.url).toMatch(/^https:\/\/news\.smol\.ai\/issues\//);
            expect(article.title).toBeDefined();
            expect(article.title).not.toBe('');
            expect(article.date).toBeInstanceOf(Date);
            expect(article.markdownContent).toBeDefined();
            expect(article.markdownContent.length).toBeGreaterThan(0);
            expect(article.markdownContent).toContain('#');
        }
    }, { timeout: 120000 });

    test("returns empty array for maxArticles = 0", async () => {
        const result = await scrapeSmolArticles(0);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toEqual([]);
        }
    });
});