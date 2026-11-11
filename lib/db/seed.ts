import { sqlite } from "./index";
import { keywordSeeds, suggestionSeeds } from "./seed-data";

export function ensureSeedData(): void {
  const suggestionCount = (
    sqlite.prepare("SELECT count(*) AS count FROM real_life_suggestions").get() as {
      count: number;
    }
  ).count;
  const keywordCount = (
    sqlite.prepare("SELECT count(*) AS count FROM star_keywords").get() as {
      count: number;
    }
  ).count;
  const now = Date.now();

  sqlite.transaction(() => {
    if (suggestionCount === 0) {
      const insert = sqlite.prepare(
        `INSERT INTO real_life_suggestions
          (title, category, domain_key, icon_key, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
      );
      for (const [title, category, domainKey, iconKey] of suggestionSeeds) {
        insert.run(title, category, domainKey, iconKey, now, now);
      }
    }
    if (keywordCount === 0) {
      const insert = sqlite.prepare(
        `INSERT INTO star_keywords
          (keyword, normalized_label, domain_key, is_active, created_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?)`,
      );
      for (const [keyword, normalized, domainKey] of keywordSeeds) {
        insert.run(keyword, normalized, domainKey, now, now);
      }
    }
  })();
}
