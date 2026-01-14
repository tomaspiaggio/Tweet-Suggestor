import { beforeEach, describe, expect, test } from "bun:test";
import { prisma } from "../../src/db/prisma";
import {
    clearAllData,
    upsertHackerNewsArticle,
    upsertSmolIssue,
    upsertTweet,
    upsertTwitterAccount,
    upsertYouTubeVideo,
} from "../../src/db/ingest";

beforeEach(async () => {
    const result = await clearAllData(prisma);
    if (result.isErr()) {
        throw result.error;
    }
});

describe("Prisma ingest deduplication", () => {
    test("deduplicates twitter accounts and tweets", async () => {
        const accountResult = await upsertTwitterAccount({
            id: "123",
            userName: "alice",
            name: "Alice",
            isBlueVerified: false,
        }, prisma);
        expect(accountResult.isOk()).toBe(true);

        const tweetResult = await upsertTweet({
            type: "tweet",
            id: "t-1",
            text: "Hello world",
            created_at: new Date("2024-01-01"),
            url: "https://x.com/alice/status/1",
            author: {
                id: "123",
                userName: "alice",
                name: "Alice",
                isBlueVerified: false,
            },
            likeCount: 1,
            retweetCount: 2,
            replyCount: 3,
        }, prisma);
        expect(tweetResult.isOk()).toBe(true);

        const tweetUpdateResult = await upsertTweet({
            type: "tweet",
            id: "t-1",
            text: "Hello world (edited)",
            created_at: new Date("2024-01-01"),
            url: "https://x.com/alice/status/1",
            author: {
                id: "123",
                userName: "alice",
                name: "Alice Updated",
                isBlueVerified: true,
            },
            likeCount: 5,
            retweetCount: 6,
            replyCount: 7,
        }, prisma);
        expect(tweetUpdateResult.isOk()).toBe(true);

        const accountCount = await prisma.twitterAccount.count();
        const tweetCount = await prisma.tweet.count();
        const tweet = await prisma.tweet.findUnique({ where: { id: "t-1" } });
        const account = await prisma.twitterAccount.findUnique({ where: { id: "123" } });

        expect(accountCount).toBe(1);
        expect(tweetCount).toBe(1);
        expect(tweet?.text).toBe("Hello world (edited)");
        expect(account?.name).toBe("Alice Updated");
        expect(account?.isBlueVerified).toBe(true);
    });

    test("deduplicates YouTube videos", async () => {
        const firstResult = await upsertYouTubeVideo({
            title: "Video One",
            channelName: "Channel",
            channelID: "chan-1",
            datePublished: new Date("2024-01-01"),
            videoId: "vid-1",
            captions: ["line 1", "line 2"],
        }, prisma);
        expect(firstResult.isOk()).toBe(true);

        const secondResult = await upsertYouTubeVideo({
            title: "Video One Updated",
            channelName: "Channel",
            channelID: "chan-1",
            datePublished: new Date("2024-01-02"),
            videoId: "vid-1",
            captions: ["updated"],
        }, prisma);
        expect(secondResult.isOk()).toBe(true);

        const videoCount = await prisma.youTubeVideo.count();
        const video = await prisma.youTubeVideo.findUnique({ where: { videoId: "vid-1" } });

        expect(videoCount).toBe(1);
        expect(video?.title).toBe("Video One Updated");
        expect(video?.captions).toEqual(["updated"]);
    });

    test("deduplicates smol issues", async () => {
        const firstResult = await upsertSmolIssue({
            url: "https://news.smol.ai/issues/1",
            title: "Issue One",
            date: new Date("2024-01-01"),
            markdownContent: "Content one",
        }, prisma);
        expect(firstResult.isOk()).toBe(true);

        const secondResult = await upsertSmolIssue({
            url: "https://news.smol.ai/issues/1",
            title: "Issue One Updated",
            date: new Date("2024-01-02"),
            markdownContent: "Content updated",
        }, prisma);
        expect(secondResult.isOk()).toBe(true);

        const issueCount = await prisma.smolIssue.count();
        const issue = await prisma.smolIssue.findUnique({ where: { url: "https://news.smol.ai/issues/1" } });

        expect(issueCount).toBe(1);
        expect(issue?.title).toBe("Issue One Updated");
        expect(issue?.markdownContent).toBe("Content updated");
    });

    test("deduplicates HackerNews articles", async () => {
        const firstResult = await upsertHackerNewsArticle({
            url: "https://example.com/article",
            hnUrl: "https://news.ycombinator.com/item?id=1",
            title: "Article One",
            domain: "example.com",
            markdownContent: "Content one",
        }, prisma);
        expect(firstResult.isOk()).toBe(true);

        const secondResult = await upsertHackerNewsArticle({
            url: "https://example.com/article",
            hnUrl: "https://news.ycombinator.com/item?id=1",
            title: "Article One Updated",
            domain: "example.com",
            markdownContent: "Content updated",
        }, prisma);
        expect(secondResult.isOk()).toBe(true);

        const articleCount = await prisma.hackerNewsArticle.count();
        const article = await prisma.hackerNewsArticle.findUnique({ where: { url: "https://example.com/article" } });

        expect(articleCount).toBe(1);
        expect(article?.title).toBe("Article One Updated");
        expect(article?.markdownContent).toBe("Content updated");
    });
});
