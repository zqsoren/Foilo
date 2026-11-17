export const homeMigration = {
  version: 17,
  name: "home_user_modules",
  sql: `
    -- Legacy ToDo created this table lazily. Fresh installations may not have it.
    CREATE TABLE IF NOT EXISTS todo_workspaces (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL DEFAULT 0,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE home_user_modules (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      module TEXT NOT NULL CHECK(module IN ('gym','todo','wealth')),
      enabled_at INTEGER NOT NULL,
      PRIMARY KEY(user_id,module)
    );
    INSERT OR IGNORE INTO home_user_modules
      SELECT user_id,'gym',0 FROM gym_plans
      UNION SELECT user_id,'gym',0 FROM gym_dashboard_settings
      UNION SELECT user_id,'todo',0 FROM todo_workspaces
      UNION SELECT user_id,'todo',0 FROM todo_dashboard_layouts
      UNION SELECT user_id,'wealth',0 FROM assets_accounts;
  `,
} as const;
