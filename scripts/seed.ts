import { databasePath } from "../lib/db";
import { ensureSeedData } from "../lib/db/seed";

ensureSeedData();
console.log(`Seed data ready: ${databasePath}`);
