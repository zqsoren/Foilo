import fs from "node:fs/promises";
import path from "node:path";
import { databasePath, sqlite } from "./db";
import { getLifeDate } from "./life-date";

const backupDirectory = path.join(path.dirname(databasePath), "backups");

export async function createBackup(label = "manual"): Promise<string> {
  await fs.mkdir(backupDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = path.join(
    backupDirectory,
    `life-workbench-${label}-${timestamp}.sqlite`,
  );
  await sqlite.backup(destination);

  const files = (await fs.readdir(backupDirectory))
    .filter((name) => name.endsWith(".sqlite"))
    .sort()
    .reverse();
  await Promise.all(
    files.slice(14).map((name) => fs.unlink(path.join(backupDirectory, name))),
  );
  const now = Date.now();
  sqlite
    .prepare("UPDATE app_settings SET last_backup_at = ?, updated_at = ? WHERE id = 1")
    .run(now, now);
  return destination;
}

export async function maybeAutoBackup(): Promise<void> {
  const row = sqlite
    .prepare("SELECT last_backup_at AS lastBackupAt FROM app_settings WHERE id = 1")
    .get() as { lastBackupAt: number | null };
  if (row.lastBackupAt && getLifeDate(row.lastBackupAt) === getLifeDate()) return;
  await createBackup("auto");
}

export function getDatabaseDisplayPath(): string {
  return databasePath;
}

