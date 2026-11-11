import { createBackup } from "../lib/backup";

const destination = await createBackup("manual");
console.log(`Backup created: ${destination}`);
