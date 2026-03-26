import "dotenv/config";
import type { PrismaConfig } from "prisma";

const GENERATE_FALLBACK_DATABASE_URL =
  "postgresql://prisma:prisma@127.0.0.1:5432/prisma?schema=public";

const isPrismaGenerateCommand = process.argv.includes("generate");
const databaseUrl =
  process.env.DATABASE_URL ??
  (isPrismaGenerateCommand ? GENERATE_FALLBACK_DATABASE_URL : undefined);

if (!databaseUrl) {
  throw new Error("DATABASE_URL env var not set");
}

export default {
  datasource: {
    url: databaseUrl,
  },
} satisfies PrismaConfig;
