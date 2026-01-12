import { ApifyClient } from 'apify-client';
import { ResultAsync, okAsync, errAsync } from "neverthrow";
import { z } from "zod";

const TweetAuthorSchema = z.object({
    id: z.union([z.number(), z.string()]),
    userName: z.string(),
    name: z.string(),
    isBlueVerified: z.boolean(),
});

const TweetSchema = z.object({
    type: z.literal("tweet"),
    id: z.union([z.number(), z.string()]),
    text: z.string(),
    created_at: z.string().transform((val) => new Date(val)),
    url: z.string(),
    author: TweetAuthorSchema,
    likeCount: z.number(),
    retweetCount: z.number(),
    replyCount: z.number(),
});

export type Tweet = z.infer<typeof TweetSchema>;

const RawItemSchema = z.object({ type: z.string() }).passthrough();

function formatDateForTwitter(date: Date): string {
    return date.toISOString().replace('T', '_').replace(/\.\d{3}Z$/, '_UTC');
}

export interface TwitterSearchParams {
    usernames: string[];
    fromDate: Date;
    toDate?: Date;
    lang?: string;
}

export function scrapeTweets(params: TwitterSearchParams): ResultAsync<Tweet[], Error> {
    if (process.env.APIFY_API_KEY == null) {
        return errAsync(new Error('APIFY_API_KEY is not set'));
    }

    if (params.usernames.length === 0) {
        return okAsync([]);
    }

    const toDate = params.toDate ?? new Date();
    const since = formatDateForTwitter(params.fromDate);
    const until = formatDateForTwitter(toDate);

    const searchTerms = params.usernames.map(
        (username) => `from:${username} since:${since} until:${until}`
    );

    const client = new ApifyClient({
        token: process.env.APIFY_API_KEY,
    });

    const actor = client.actor("kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest");

    const input = {
        "filter:blue_verified": false,
        "filter:consumer_video": false,
        "filter:has_engagement": false,
        "filter:hashtags": false,
        "filter:images": false,
        "filter:links": false,
        "filter:media": false,
        "filter:mentions": false,
        "filter:native_video": false,
        "filter:nativeretweets": false,
        "filter:news": false,
        "filter:pro_video": false,
        "filter:quote": false,
        "filter:replies": false,
        "filter:safe": false,
        "filter:spaces": false,
        "filter:twimg": false,
        "filter:videos": false,
        "filter:vine": false,
        "include:nativeretweets": false,
        searchTerms,
        lang: params.lang ?? "en",
    };

    return ResultAsync.fromPromise(
        actor.call(input),
        (error) => new Error(`Failed to call actor: ${error instanceof Error ? error.message : String(error)}`)
    )
        .map((run) => {
            console.log('Got results from dataset');
            return run;
        })
        .andThen((run) =>
            ResultAsync.fromPromise(
                client.dataset(run.defaultDatasetId).listItems(),
                (error) => new Error(`Failed to fetch dataset: ${error instanceof Error ? error.message : String(error)}`)
            ).map((response) => response.items)
        )
        .andThen((items) => {
            const tweets: Tweet[] = [];
            for (const item of items) {
                const rawParse = RawItemSchema.safeParse(item);
                if (!rawParse.success || rawParse.data.type !== "tweet") {
                    continue;
                }
                const tweetParse = TweetSchema.safeParse(item);
                if (tweetParse.success) {
                    tweets.push(tweetParse.data);
                } else {
                    console.log('Failed to parse tweet:', tweetParse.error.message);
                }
            }
            return okAsync(tweets);
        });
}
