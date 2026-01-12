import { describe, test, expect } from "bun:test";
import { scrapeVideoBatch } from "../../src/scrapers/youtube";

describe("YouTube scraper integration", () => {
    test("scrapes a single video successfully", async () => {
        const result = await scrapeVideoBatch([
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        ]);

        expect(result.isOk()).toBe(true);

        if (result.isOk()) {
            const videos = result.value;
            expect(videos.length).toBe(1);

            const video = videos[0]!;
            expect(video.title).toBeDefined();
            expect(video.channelName).toBeDefined();
            expect(video.channelID).toBeDefined();
            expect(video.videoId).toBe("dQw4w9WgXcQ");
            expect(video.datePublished).toBeInstanceOf(Date);
            expect(Array.isArray(video.captions)).toBe(true);
        }
    }, { timeout: 60000 });

    test("returns empty array for empty input", async () => {
        const result = await scrapeVideoBatch([]);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toEqual([]);
        }
    });
});
