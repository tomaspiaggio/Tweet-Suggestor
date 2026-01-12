import { describe, test, expect } from "bun:test";
import { scrapeTweets } from "../../src/scrapers/twitter";

describe("Twitter scraper integration", () => {
    test("scrapes tweets from a single user for one day", async () => {
        const result = await scrapeTweets({
            usernames: ["elonmusk"],
            fromDate: new Date("2024-01-01"),
            toDate: new Date("2024-01-02"),
        });

        if (result.isErr()) {
            console.error("Error:", result.error.message);
        }
        expect(result.isOk()).toBe(true);

        if (result.isOk()) {
            const tweets = result.value;
            expect(tweets.length).toBeGreaterThan(0);

            const tweet = tweets[0]!;
            expect(tweet.id).toBeDefined();
            expect(tweet.text).toBeDefined();
            expect(tweet.created_at).toBeInstanceOf(Date);
            expect(tweet.author.id).toBeDefined();
            expect(tweet.author.name).toBeDefined();
            expect(tweet.author.userName.toLowerCase()).toBe("elonmusk");
        }
    }, { timeout: 60000 });

    test("returns empty array for empty usernames", async () => {
        const result = await scrapeTweets({
            usernames: [],
            fromDate: new Date("2024-01-01"),
        });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toEqual([]);
        }
    });
});
