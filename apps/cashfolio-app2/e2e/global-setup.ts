import { disconnectDb, resetDatabase } from "./support/db";

export default async function globalSetup(): Promise<void> {
  try {
    await resetDatabase();
  } finally {
    await disconnectDb();
  }
}
