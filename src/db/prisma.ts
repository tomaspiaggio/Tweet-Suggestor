import { PrismaClient } from "../generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

function createAdapter(databaseUrl: string): PrismaLibSql {
    return new PrismaLibSql({ url: databaseUrl });
}

const defaultDatabaseUrl = process.env.DATABASE_URL ?? "file:./dev.db";

export const prisma = new PrismaClient({
    adapter: createAdapter(defaultDatabaseUrl),
});

export function createPrismaClient(databaseUrl: string): PrismaClient {
    return new PrismaClient({
        adapter: createAdapter(databaseUrl),
    });
}
