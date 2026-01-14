import { ApifyClient } from 'apify-client';
import { ResultAsync, okAsync, errAsync } from "neverthrow";
import { z } from "zod";

const VideoInformationSchema = z.object({
    title: z.string().min(1),
    channelName: z.string().min(1),
    channelID: z.string().min(1).transform((val) => val),
    datePublished: z.preprocess((val) => {
        if (val == null) return undefined;
        if (val instanceof Date) return val;
        if (typeof val === "string") return new Date(val);
        return undefined;
    }, z.date()),
    videoId: z.string().min(1),
    captions: z.array(z.string().nullable()).optional().default([]).transform((captions) =>
        captions.filter((caption): caption is string => typeof caption === "string")
    ),
});

export type VideoInformation = z.infer<typeof VideoInformationSchema>;

export function scrapeVideoBatch(videoUrls: string[]): ResultAsync<VideoInformation[], Error> {
    if (process.env.APIFY_API_KEY == null) {
        return errAsync(new Error('APIFY_API_KEY is not set'));
    }

    if (videoUrls.length === 0) {
        return okAsync([]);
    }

    const client = new ApifyClient({
        token: process.env.APIFY_API_KEY,
    });

    const actor = client.actor("karamelo/youtube-transcripts");

    const input = {
        channelIDBoolean: true,
        channelNameBoolean: true,
        commentsBoolean: false,
        datePublishedBoolean: true,
        dateTextBoolean: false,
        descriptionBoolean: false,
        keywordsBoolean: false,
        likesBoolean: false,
        maxRetries: 8,
        proxyOptions: {
            useApifyProxy: true,
            apifyProxyGroups: [
                "BUYPROXIES94952"
            ]
        },
        relativeDateTextBoolean: false,
        thumbnailBoolean: false,
        urls: videoUrls,
        viewCountBoolean: false
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
            const videos: VideoInformation[] = [];
            const errors: string[] = [];

            for (const item of items) {
                const parseResult = VideoInformationSchema.safeParse(item);
                if (parseResult.success) {
                    videos.push(parseResult.data);
                } else {
                    errors.push(parseResult.error.message);
                }
            }

            if (videos.length === 0) {
                return errAsync(new Error(`Validation error: ${errors.join("; ")}`));
            }

            if (errors.length > 0) {
                console.warn(`Skipped ${errors.length} invalid videos`);
            }

            return okAsync(videos);
        });
}