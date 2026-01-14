import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText } from "ai";
import * as cheerio from "cheerio";
import "dotenv/config";
import {
    upsertHackerNewsArticle,
    upsertSmolIssue,
    upsertTweet,
    upsertYouTubeVideo,
} from "./src/db/ingest";
import { prisma } from "./src/db/prisma";
import { scrapeHackerNews } from "./src/scrapers/hackernews";
import { scrapeSmolArticles } from "./src/scrapers/smol.ai";
import { scrapeTweets } from "./src/scrapers/twitter";
import { scrapeVideoBatch } from "./src/scrapers/youtube";

const TWITTER_USERS = [
    "theo",
    "ThePrimeagen",
    "thdxr",
    "simonw",
    "rauchg",
    "LowLevelTweets",
    "LiveOverflow",
];

const YOUTUBE_CHANNELS = [
    "https://www.youtube.com/@t3dotgg",
    "https://www.youtube.com/@ThePrimeTimeagen",
    "https://www.youtube.com/@ThePrimeagen",
];

const MAX_ITEMS = 10;

interface ContentItem {
    source: string;
    title: string;
    url: string;
    content: string;
    publishedAt?: string;
}

const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
});

function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}...`;
}

async function fetchChannelId(channelUrl: string): Promise<string | null> {
    const response = await fetch(channelUrl);
    const html = await response.text();
    const match = html.match(/"channelId":"([^"]+)"/);
    return match?.[1] ?? null;
}

async function fetchLatestVideoUrls(channelId: string): Promise<string[]> {
    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    const response = await fetch(feedUrl);
    const xml = await response.text();
    const $ = cheerio.load(xml, { xmlMode: true });

    return $("entry link[rel='alternate']")
        .map((_, element) => $(element).attr("href"))
        .get()
        .filter((href): href is string => Boolean(href));
}

function extractVideoId(url: string): string | null {
    const match = url.match(/[?&]v=([^&]+)/);
    return match?.[1] ?? null;
}

async function fetchNewTweets(): Promise<ContentItem[]> {
    const fromDate = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const tweetsResult = await scrapeTweets({
        usernames: TWITTER_USERS,
        fromDate,
    });

    if (tweetsResult.isErr()) {
        console.error("Failed to scrape tweets:", tweetsResult.error.message);
        return [];
    }

    const tweets = tweetsResult.value;
    const ids = tweets.map((tweet) => String(tweet.id));
    if (ids.length === 0) return [];

    const existing = await prisma.tweet.findMany({
        where: { id: { in: ids } },
        select: { id: true },
    });
    const existingIds = new Set(existing.map((row) => row.id));

    const newTweets = tweets.filter((tweet) => !existingIds.has(String(tweet.id)));

    await Promise.all(newTweets.map(async (tweet) => {
        const result = await upsertTweet(tweet, prisma);
        if (result.isErr()) {
            console.error("Failed to upsert tweet:", result.error.message);
        }
    }));

    return newTweets.map((tweet) => ({
        source: "Twitter",
        title: `Tweet by @${tweet.author.userName}`,
        url: tweet.url,
        content: tweet.text,
        publishedAt: tweet.created_at.toISOString(),
    }));
}

async function fetchNewYouTubeVideos(): Promise<ContentItem[]> {
    const channelIds = await Promise.all(
        YOUTUBE_CHANNELS.map(async (url) => ({ url, channelId: await fetchChannelId(url) }))
    );
    const validChannelIds = channelIds
        .map((channel) => channel.channelId)
        .filter((id): id is string => Boolean(id));

    if (validChannelIds.length === 0) {
        return [];
    }

    const feedUrls = await Promise.all(validChannelIds.map(fetchLatestVideoUrls));
    const urls = Array.from(new Set(feedUrls.flat()))
        .slice(0, MAX_ITEMS);
    const urlIds = urls
        .map((url) => ({ url, videoId: extractVideoId(url) }))
        .filter((entry): entry is { url: string; videoId: string } => Boolean(entry.videoId));

    const existing = await prisma.youTubeVideo.findMany({
        where: { videoId: { in: urlIds.map((entry) => entry.videoId) } },
        select: { videoId: true },
    });
    const existingIds = new Set(existing.map((row) => row.videoId));

    const newUrls = urlIds.filter((entry) => !existingIds.has(entry.videoId));
    if (newUrls.length === 0) return [];

    const videosResult = await scrapeVideoBatch(newUrls.map((entry) => entry.url));
    if (videosResult.isErr()) {
        console.error("Failed to scrape YouTube videos:", videosResult.error.message);
        return [];
    }

    await Promise.all(videosResult.value.map(async (video) => {
        const result = await upsertYouTubeVideo(video, prisma);
        if (result.isErr()) {
            console.error("Failed to upsert YouTube video:", result.error.message);
        }
    }));

    return videosResult.value.map((video) => ({
        source: "YouTube",
        title: video.title,
        url: `https://www.youtube.com/watch?v=${video.videoId}`,
        content: truncate(video.captions.join(" "), 2000),
        publishedAt: video.datePublished.toISOString(),
    }));
}

async function fetchNewSmolIssues(): Promise<ContentItem[]> {
    const smolResult = await scrapeSmolArticles(MAX_ITEMS);
    if (smolResult.isErr()) {
        console.error("Failed to scrape smol.ai:", smolResult.error.message);
        return [];
    }

    const issues = smolResult.value;
    const existing = await prisma.smolIssue.findMany({
        where: { url: { in: issues.map((issue) => issue.url) } },
        select: { url: true },
    });
    const existingUrls = new Set(existing.map((row) => row.url));

    const newIssues = issues.filter((issue) => !existingUrls.has(issue.url));

    await Promise.all(newIssues.map(async (issue) => {
        const result = await upsertSmolIssue(issue, prisma);
        if (result.isErr()) {
            console.error("Failed to upsert smol issue:", result.error.message);
        }
    }));

    return newIssues.map((issue) => ({
        source: "smol.ai",
        title: issue.title,
        url: issue.url,
        content: truncate(issue.markdownContent, 4000),
        publishedAt: issue.date.toISOString(),
    }));
}

async function fetchNewHackerNewsArticles(): Promise<ContentItem[]> {
    const hnResult = await scrapeHackerNews(MAX_ITEMS);
    if (hnResult.isErr()) {
        console.error("Failed to scrape HackerNews:", hnResult.error.message);
        return [];
    }

    const articles = hnResult.value;
    const existing = await prisma.hackerNewsArticle.findMany({
        where: { url: { in: articles.map((article) => article.url) } },
        select: { url: true },
    });
    const existingUrls = new Set(existing.map((row) => row.url));

    const newArticles = articles.filter((article) => !existingUrls.has(article.url));

    await Promise.all(newArticles.map(async (article) => {
        const result = await upsertHackerNewsArticle(article, prisma);
        if (result.isErr()) {
            console.error("Failed to upsert HackerNews article:", result.error.message);
        }
    }));

    return newArticles.map((article) => ({
        source: "HackerNews",
        title: article.title,
        url: article.url,
        content: truncate(article.markdownContent, 4000),
    }));
}

async function generateTweetSummary(items: ContentItem[]): Promise<string> {
    if (items.length === 0) {
        return "No new content found.";
    }

    const prompt = `You are a social media account manager. Your task is to take content from other creators and sources (youtube, twitter, blogs, etc) and determine if 
they're tweet worthy for a CTO of an AI startup in SF. Usually, interesting consumable by non-tech news of ai models or advancements are tweet worthy. 
But also, advancements on nextjs, typescript in general, startup stuff, usually performs well with my audience. 

Here are some of my best performing tweets. Match tone and style as close as possible. ALWAYS avoid emojis, em dashes and uppercases (unless needed for clarification of some kind).

Tweet 1: 
\`\`\`
O-1A visa finally approved

bringing layer 8 ops to SF. see you there 🇺🇸
<with an image of me working at he vercel office>
\`\`\`

Tweet 2: 
\`\`\`
come say hi
<with an image of my hand and the badge for the next conf>
\`\`\`

Tweet 3: 
\`\`\`
who's the cto, who's the ceo?
<with an image of me and my ceo, but i have a laptop full of stickers and the ceo has an ipad>
\`\`\`

Tweet 4: 
\`\`\`
stuff you need to build an amazing startup
✅ a computer
✅ an amazing team
✅ being in sf
❌ shoes
❌ furniture
<with an image of me just arrived to my sf appartment. no shoes, sitting on the floor lying against the wall working>
\`\`\`

Tweet 5: 
\`\`\`
waymo + viejas locas = good mood setting for late night coding

<with an image of me on a waymo>
\`\`\`

Tweet 6: 
\`\`\`
como amante ferviente del chipá, me siento obligado a compartir esta informacion. 

el mejor chipa de la ciudad lo tiene Caversaschi & Co. en humboldt y nicaragua. la mismisima gloria.

si pasan a probarlo avisen y les doy stickers de 
@autonomaai
\`\`\`

Tweet 7: 
\`\`\`
life hack if you want to filter out linkedin spam
i can't believe this worked btw

<with a couple of screenshots of my linkedin profile where i prompt injected an LLM into sending me spam messages with a dog emoji to filter them out>
\`\`\`


## Tweet Worthy
- Bullet list with: **Title** (Source) - 1 sentence summary. Include URL.
- Add **Image Suggestion** with a concrete visual to look for (e.g., "chart of X", "photo of Y", "screenshot of Z") and, if available, a supporting image URL.
- Add **Supporting Links**: 1-2 links that support key claims or provide context.

## Not Tweet Worthy
- Bullet list with: **Title** (Source) - short reason.

## Draft Tweets
For each draft tweet include:
- **Tweet**: one sentence
- **Motivation**: why this is worth tweeting
- **Avoiding Redundancy**: how this differs from common takes
- **Evidence Links**: 1-2 URLs backing the claim
- **Image Suggestion**: concrete visual to look for

Provide 3-5 draft tweets for the best items.

Here are the items:
${items
            .map(
                (item) => `Source: ${item.source}
Title: ${item.title}
URL: ${item.url}
Published: ${item.publishedAt ?? ""}
Content:
${item.content}
---`
            )
            .join("\n")}`;

    const result = await generateText({
        model: openrouter("google/gemini-3-flash-preview"),
        prompt,
    });

    return result.text.trim();
}

async function main(): Promise<void> {
    if (!process.env.OPENROUTER_API_KEY) {
        console.error("Missing OPENROUTER_API_KEY env var.");
        process.exit(1);
    }

    const [tweets, videos, smolIssues, hnArticles] = await Promise.all([
        fetchNewTweets(),
        fetchNewYouTubeVideos(),
        fetchNewSmolIssues(),
        fetchNewHackerNewsArticles(),
    ]);

    const allItems = [...tweets, ...videos, ...smolIssues, ...hnArticles];
    const report = await generateTweetSummary(allItems);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportPath = `results/summary-${timestamp}.md`;

    await Bun.write(reportPath, report);
    console.log(`\nSaved report to ${reportPath}`);
}

main()
    .catch((error) => {
        console.error("Aggregation failed:", error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
