import { prisma as defaultPrisma } from "./prisma";
import { ResultAsync, okAsync, errAsync } from "neverthrow";
import type { PrismaClient } from "../generated/prisma/client";
import type { Tweet } from "../scrapers/twitter";
import type { VideoInformation } from "../scrapers/youtube";
import type { SmolArticle } from "../scrapers/smol.ai";
import type { HackerNewsArticle } from "../scrapers/hackernews";

export interface TwitterAccountInput {
    id: string;
    userName: string;
    name: string;
    isBlueVerified: boolean;
}

export function upsertTwitterAccount(
    account: TwitterAccountInput,
    prismaClient: PrismaClient = defaultPrisma
): ResultAsync<void, Error> {
    return ResultAsync.fromPromise(
        prismaClient.twitterAccount.upsert({
            where: { id: account.id },
            update: {
                userName: account.userName,
                name: account.name,
                isBlueVerified: account.isBlueVerified,
            },
            create: {
                id: account.id,
                userName: account.userName,
                name: account.name,
                isBlueVerified: account.isBlueVerified,
            },
        }).then(() => undefined),
        (error) => new Error(`Failed to upsert Twitter account: ${error instanceof Error ? error.message : String(error)}`)
    );
}

export function upsertTweet(
    tweet: Tweet,
    prismaClient: PrismaClient = defaultPrisma
): ResultAsync<void, Error> {
    const authorId = String(tweet.author.id);

    return upsertTwitterAccount(
        {
            id: authorId,
            userName: tweet.author.userName,
            name: tweet.author.name,
            isBlueVerified: tweet.author.isBlueVerified,
        },
        prismaClient
    ).andThen(() =>
        ResultAsync.fromPromise(
            prismaClient.tweet.upsert({
                where: { id: String(tweet.id) },
                update: {
                    text: tweet.text,
                    createdAt: tweet.created_at,
                    url: tweet.url,
                    likeCount: tweet.likeCount,
                    retweetCount: tweet.retweetCount,
                    replyCount: tweet.replyCount,
                    authorId,
                },
                create: {
                    id: String(tweet.id),
                    text: tweet.text,
                    createdAt: tweet.created_at,
                    url: tweet.url,
                    likeCount: tweet.likeCount,
                    retweetCount: tweet.retweetCount,
                    replyCount: tweet.replyCount,
                    authorId,
                },
            }).then(() => undefined),
            (error) => new Error(`Failed to upsert tweet: ${error instanceof Error ? error.message : String(error)}`)
        )
    );
}

export function upsertYouTubeVideo(
    video: VideoInformation,
    prismaClient: PrismaClient = defaultPrisma
): ResultAsync<void, Error> {
    const url = `https://www.youtube.com/watch?v=${video.videoId}`;

    return ResultAsync.fromPromise(
        prismaClient.youTubeVideo.upsert({
            where: { videoId: video.videoId },
            update: {
                title: video.title,
                channelName: video.channelName,
                channelId: video.channelID,
                datePublished: video.datePublished,
                url,
                captions: video.captions,
            },
            create: {
                videoId: video.videoId,
                title: video.title,
                channelName: video.channelName,
                channelId: video.channelID,
                datePublished: video.datePublished,
                url,
                captions: video.captions,
            },
        }).then(() => undefined),
        (error) => new Error(`Failed to upsert YouTube video: ${error instanceof Error ? error.message : String(error)}`)
    );
}

export function upsertSmolIssue(
    article: SmolArticle,
    prismaClient: PrismaClient = defaultPrisma
): ResultAsync<void, Error> {
    return ResultAsync.fromPromise(
        prismaClient.smolIssue.upsert({
            where: { url: article.url },
            update: {
                title: article.title,
                date: article.date,
                markdownContent: article.markdownContent,
            },
            create: {
                url: article.url,
                title: article.title,
                date: article.date,
                markdownContent: article.markdownContent,
            },
        }).then(() => undefined),
        (error) => new Error(`Failed to upsert Smol issue: ${error instanceof Error ? error.message : String(error)}`)
    );
}

export function upsertHackerNewsArticle(
    article: HackerNewsArticle,
    prismaClient: PrismaClient = defaultPrisma
): ResultAsync<void, Error> {
    return ResultAsync.fromPromise(
        prismaClient.hackerNewsArticle.upsert({
            where: { url: article.url },
            update: {
                hnUrl: article.hnUrl,
                title: article.title,
                domain: article.domain,
                markdownContent: article.markdownContent,
            },
            create: {
                url: article.url,
                hnUrl: article.hnUrl,
                title: article.title,
                domain: article.domain,
                markdownContent: article.markdownContent,
            },
        }).then(() => undefined),
        (error) => new Error(`Failed to upsert HackerNews article: ${error instanceof Error ? error.message : String(error)}`)
    );
}

export function clearAllData(prismaClient: PrismaClient = defaultPrisma): ResultAsync<void, Error> {
    return ResultAsync.fromPromise(
        prismaClient.$transaction([
            prismaClient.tweet.deleteMany(),
            prismaClient.twitterAccount.deleteMany(),
            prismaClient.youTubeVideo.deleteMany(),
            prismaClient.smolIssue.deleteMany(),
            prismaClient.hackerNewsArticle.deleteMany(),
        ]).then(() => undefined),
        (error) => new Error(`Failed to clear data: ${error instanceof Error ? error.message : String(error)}`)
    );
}
