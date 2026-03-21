import { disconnectDb } from "./support/db";

export default async function globalTeardown(): Promise<void> {
  await disconnectDb();
}
