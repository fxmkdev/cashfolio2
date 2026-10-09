import { config } from "dotenv";
import type { PrismaConfig } from "prisma";
import { env } from "prisma/config";

config();

const isPrismaGenerateCommand = process.argv.includes("generate");
const databaseUrl = isPrismaGenerateCommand
  ? process.env.DATABASE_URL
  : env("DATABASE_URL");

export default {
  datasource: {
    url: databaseUrl,
  },
} satisfies PrismaConfig;
