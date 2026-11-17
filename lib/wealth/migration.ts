export const wealthMigration = {
  version: 15,
  name: "wealth_accounts_positions_history",
  sql: `
CREATE TABLE assets_accounts (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
 type_code TEXT NOT NULL, institution TEXT NOT NULL DEFAULT '', name TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '', card_last4 TEXT NOT NULL DEFAULT '',
 bookkeeping_enabled INTEGER NOT NULL CHECK(bookkeeping_enabled IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(id,user_id)
);
CREATE INDEX assets_accounts_user ON assets_accounts(user_id,id);
CREATE TABLE assets_positions (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), account_id INTEGER NOT NULL,
 name TEXT NOT NULL, category_code TEXT NOT NULL, side TEXT NOT NULL CHECK(side IN ('asset','liability')),
 currency_code TEXT NOT NULL, include_in_totals INTEGER NOT NULL CHECK(include_in_totals IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(id,user_id), FOREIGN KEY(account_id,user_id) REFERENCES assets_accounts(id,user_id)
);
CREATE INDEX assets_positions_account ON assets_positions(user_id,account_id,id);
CREATE TABLE assets_valuations (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), position_id INTEGER NOT NULL,
 as_of_date TEXT NOT NULL, amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor BETWEEN 0 AND 99999999999999),
 note TEXT NOT NULL DEFAULT '', recorded_at INTEGER NOT NULL,
 FOREIGN KEY(position_id,user_id) REFERENCES assets_positions(id,user_id)
);
CREATE INDEX assets_valuations_history ON assets_valuations(user_id,position_id,as_of_date DESC,id DESC);
CREATE TABLE assets_requests (
 user_id INTEGER NOT NULL REFERENCES users(id), request_id TEXT NOT NULL, command_hash TEXT NOT NULL,
 result_json TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(user_id,request_id)
);
CREATE TABLE assets_fx_cache (cache_key TEXT PRIMARY KEY, payload TEXT, fetched_at INTEGER NOT NULL DEFAULT 0, attempted_at INTEGER NOT NULL, failed INTEGER NOT NULL DEFAULT 0);
`,
};

export const wealthFlowMigration = {
  version: 16,
  name: "wealth_separate_accounts_assets",
  sql: `
 ALTER TABLE assets_positions ADD COLUMN bookkeeping_enabled INTEGER NOT NULL DEFAULT 0 CHECK(bookkeeping_enabled IN (0,1));
 ALTER TABLE assets_positions ADD COLUMN deleted_at INTEGER;
 UPDATE assets_positions SET bookkeeping_enabled=(SELECT bookkeeping_enabled FROM assets_accounts WHERE id=account_id);
 UPDATE assets_accounts SET note=CASE
   WHEN name=institution || ' · 尾号' || card_last4 THEN note
   WHEN trim(note)='' THEN name
   WHEN instr(note,name)>0 THEN note
   ELSE name || '，' || note END,
   name=institution || ' · 尾号' || card_last4
 WHERE type_code IN ('debit-card','credit-card') AND institution<>'' AND length(card_last4)=4;
 CREATE INDEX assets_positions_active ON assets_positions(user_id,deleted_at,account_id);
 `,
};
