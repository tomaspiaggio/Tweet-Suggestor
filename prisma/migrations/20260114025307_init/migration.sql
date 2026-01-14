-- CreateTable
CREATE TABLE "TwitterAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isBlueVerified" BOOLEAN NOT NULL
);

-- CreateTable
CREATE TABLE "Tweet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "url" TEXT NOT NULL,
    "likeCount" INTEGER NOT NULL,
    "retweetCount" INTEGER NOT NULL,
    "replyCount" INTEGER NOT NULL,
    "authorId" TEXT NOT NULL,
    "scrapedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Tweet_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "TwitterAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "YouTubeVideo" (
    "videoId" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "channelName" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "datePublished" DATETIME NOT NULL,
    "url" TEXT NOT NULL,
    "captions" JSONB NOT NULL,
    "scrapedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SmolIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "markdownContent" TEXT NOT NULL,
    "scrapedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "HackerNewsArticle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "hnUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "domain" TEXT,
    "markdownContent" TEXT NOT NULL,
    "scrapedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "TwitterAccount_userName_key" ON "TwitterAccount"("userName");

-- CreateIndex
CREATE UNIQUE INDEX "Tweet_url_key" ON "Tweet"("url");

-- CreateIndex
CREATE UNIQUE INDEX "YouTubeVideo_url_key" ON "YouTubeVideo"("url");

-- CreateIndex
CREATE UNIQUE INDEX "SmolIssue_url_key" ON "SmolIssue"("url");

-- CreateIndex
CREATE UNIQUE INDEX "HackerNewsArticle_url_key" ON "HackerNewsArticle"("url");
