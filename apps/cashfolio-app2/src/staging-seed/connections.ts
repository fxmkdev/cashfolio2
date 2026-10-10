import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../.prisma-client/client";
import type { VerifiedConnection } from "./target";

export function createSeedClient(connection: VerifiedConnection): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg(connection) });
}
