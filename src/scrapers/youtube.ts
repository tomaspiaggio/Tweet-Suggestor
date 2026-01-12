import { ApifyClient } from 'apify-client';
import { ResultAsync, okAsync, errAsync } from "neverthrow";
import { z } from "zod";

const VideoInformationSchema = z.object({
    title: z.string(),
    channelName: z.string(),
    channelID: z.string().transform((val) => val),
    datePublished: z.string().or(z.date()).transform((val) => {
        if (val instanceof Date) return val;
        return new Date(val);
    }),
    videoId: z.string(),
    captions: z.array(z.string()),
});

export type VideoInformation = z.infer<typeof VideoInformationSchema>;

const VideoInformationArraySchema = z.array(VideoInformationSchema);

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
            const parseResult = VideoInformationArraySchema.safeParse(items);
            if (!parseResult.success) {
                return errAsync(new Error(`Validation error: ${parseResult.error.message}`));
            }
            return okAsync(parseResult.data);
        });
}