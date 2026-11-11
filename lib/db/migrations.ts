export const migrations = [
  {
    version: 1,
    name: "initial",
    sql: `
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
        day_boundary_hour INTEGER NOT NULL DEFAULT 4 CHECK (day_boundary_hour BETWEEN 0 AND 23),
        daily_work_target_minutes INTEGER NOT NULL DEFAULT 330 CHECK (daily_work_target_minutes BETWEEN 0 AND 1439),
        weekly_workout_target INTEGER NOT NULL DEFAULT 3 CHECK (weekly_workout_target BETWEEN 0 AND 7),
        last_backup_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS daily_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        record_date TEXT NOT NULL UNIQUE CHECK (record_date GLOB '????-??-??'),
        sleep_minutes INTEGER CHECK (sleep_minutes IS NULL OR sleep_minutes BETWEEN 0 AND 1440),
        work_target_minutes INTEGER NOT NULL CHECK (work_target_minutes BETWEEN 0 AND 1439),
        weekly_workout_target INTEGER NOT NULL CHECK (weekly_workout_target BETWEEN 0 AND 7),
        daily_state_code TEXT,
        daily_state_custom TEXT,
        day_summary TEXT,
        closed_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS time_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL CHECK (kind IN ('work', 'entertainment')),
        record_date TEXT NOT NULL CHECK (record_date GLOB '????-??-??'),
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        note TEXT,
        source TEXT NOT NULL CHECK (source IN ('timer', 'manual')),
        is_manually_edited INTEGER NOT NULL DEFAULT 0 CHECK (is_manually_edited IN (0, 1)),
        deleted_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        CHECK (ended_at IS NULL OR ended_at >= started_at)
      );
      CREATE INDEX IF NOT EXISTS time_sessions_date_kind_idx ON time_sessions(record_date, kind, started_at);
      CREATE UNIQUE INDEX IF NOT EXISTS time_sessions_single_running
        ON time_sessions ((1)) WHERE ended_at IS NULL AND deleted_at IS NULL;

      CREATE TRIGGER IF NOT EXISTS time_sessions_no_overlap_insert
      BEFORE INSERT ON time_sessions
      WHEN NEW.deleted_at IS NULL AND EXISTS (
        SELECT 1 FROM time_sessions existing
        WHERE existing.deleted_at IS NULL
          AND NEW.started_at < COALESCE(existing.ended_at, 9223372036854775807)
          AND COALESCE(NEW.ended_at, 9223372036854775807) > existing.started_at
      )
      BEGIN SELECT RAISE(ABORT, 'SESSION_OVERLAP'); END;

      CREATE TRIGGER IF NOT EXISTS time_sessions_no_overlap_update
      BEFORE UPDATE OF started_at, ended_at, deleted_at ON time_sessions
      WHEN NEW.deleted_at IS NULL AND EXISTS (
        SELECT 1 FROM time_sessions existing
        WHERE existing.deleted_at IS NULL AND existing.id != NEW.id
          AND NEW.started_at < COALESCE(existing.ended_at, 9223372036854775807)
          AND COALESCE(NEW.ended_at, 9223372036854775807) > existing.started_at
      )
      BEGIN SELECT RAISE(ABORT, 'SESSION_OVERLAP'); END;

      CREATE TABLE IF NOT EXISTS body_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        record_date TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK (status IN ('workout', 'light_activity', 'no_activity')),
        note TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS real_life_suggestions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        domain_key TEXT NOT NULL,
        icon_key TEXT,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS real_life_batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        record_date TEXT NOT NULL,
        replaced_at INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS real_life_current_batch_idx
        ON real_life_batches(record_date) WHERE replaced_at IS NULL;

      CREATE TABLE IF NOT EXISTS real_life_batch_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id INTEGER NOT NULL REFERENCES real_life_batches(id) ON DELETE CASCADE,
        suggestion_id INTEGER NOT NULL REFERENCES real_life_suggestions(id),
        position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 4),
        completed_at INTEGER,
        created_at INTEGER NOT NULL,
        UNIQUE(batch_id, suggestion_id),
        UNIQUE(batch_id, position)
      );

      CREATE TABLE IF NOT EXISTS todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
        completed_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
        completed_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS wishes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'fulfilled')),
        fulfilled_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS life_timelines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
        start_date TEXT NOT NULL,
        end_date TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        CHECK (end_date IS NULL OR end_date >= start_date)
      );

      CREATE TABLE IF NOT EXISTS star_keywords (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword TEXT NOT NULL UNIQUE,
        normalized_label TEXT NOT NULL,
        domain_key TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `,
  },
  {
    version: 2,
    name: "project_workspace",
    sql: `
      ALTER TABLE projects ADD COLUMN goal TEXT;
      ALTER TABLE projects ADD COLUMN completion_criteria TEXT;
      ALTER TABLE projects ADD COLUMN current_stage_id INTEGER;
      ALTER TABLE projects ADD COLUMN archived_at INTEGER;

      CREATE TABLE IF NOT EXISTS project_stages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 80),
        position INTEGER NOT NULL CHECK (position >= 0),
        completed_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(project_id, position)
      );
      CREATE INDEX IF NOT EXISTS project_stages_project_idx
        ON project_stages(project_id, position);

      CREATE TABLE IF NOT EXISTS project_stage_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stage_id INTEGER NOT NULL REFERENCES project_stages(id) ON DELETE CASCADE,
        title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
        position INTEGER NOT NULL CHECK (position >= 0),
        completed_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(stage_id, position)
      );
      CREATE INDEX IF NOT EXISTS project_stage_tasks_stage_idx
        ON project_stage_tasks(stage_id, position);

      CREATE TABLE IF NOT EXISTS project_stage_recurring_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stage_id INTEGER NOT NULL REFERENCES project_stages(id) ON DELETE CASCADE,
        title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
        frequency TEXT NOT NULL DEFAULT 'daily'
          CHECK (frequency IN ('daily', 'weekly', 'custom')),
        frequency_label TEXT,
        position INTEGER NOT NULL CHECK (position >= 0),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(stage_id, position)
      );
      CREATE INDEX IF NOT EXISTS project_stage_recurring_tasks_stage_idx
        ON project_stage_recurring_tasks(stage_id, position);

      CREATE TABLE IF NOT EXISTS project_stage_recurring_checkins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recurring_task_id INTEGER NOT NULL
          REFERENCES project_stage_recurring_tasks(id) ON DELETE CASCADE,
        record_date TEXT NOT NULL CHECK (record_date GLOB '????-??-??'),
        completed_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(recurring_task_id, record_date)
      );
      CREATE INDEX IF NOT EXISTS project_stage_recurring_checkins_date_idx
        ON project_stage_recurring_checkins(record_date, recurring_task_id);
    `,
  },
  {
    version: 3,
    name: "project_ai_foundation",
    sql: `
      ALTER TABLE app_settings ADD COLUMN ai_provider TEXT NOT NULL DEFAULT 'none';
      ALTER TABLE app_settings ADD COLUMN ai_model TEXT;
      ALTER TABLE app_settings ADD COLUMN ai_base_url TEXT;
      ALTER TABLE app_settings ADD COLUMN ai_api_key TEXT;
      ALTER TABLE app_settings ADD COLUMN weekly_check_day INTEGER NOT NULL DEFAULT 1
        CHECK (weekly_check_day BETWEEN 0 AND 6);
      ALTER TABLE app_settings ADD COLUMN weekly_check_hour INTEGER NOT NULL DEFAULT 13
        CHECK (weekly_check_hour BETWEEN 0 AND 23);

      ALTER TABLE projects ADD COLUMN workflow_status TEXT NOT NULL DEFAULT 'planning'
        CHECK (workflow_status IN ('planning', 'active', 'completed'));
      UPDATE projects
      SET workflow_status = CASE WHEN status = 'completed' THEN 'completed' ELSE 'active' END;

      CREATE TABLE IF NOT EXISTS project_ai_conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 80),
        summary TEXT,
        summarized_through_message_id INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS project_ai_conversations_project_idx
        ON project_ai_conversations(project_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS project_ai_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL
          REFERENCES project_ai_conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        message_type TEXT NOT NULL DEFAULT 'chat'
          CHECK (message_type IN ('chat', 'weekly_report')),
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS project_ai_messages_conversation_idx
        ON project_ai_messages(conversation_id, id);

      CREATE TABLE IF NOT EXISTS project_ai_change_sets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        conversation_id INTEGER REFERENCES project_ai_conversations(id) ON DELETE SET NULL,
        change_kind TEXT NOT NULL CHECK (change_kind IN ('ordinary', 'major')),
        status TEXT NOT NULL
          CHECK (status IN ('proposed', 'applied', 'rejected', 'undone', 'superseded')),
        title TEXT NOT NULL,
        reason TEXT,
        operations_json TEXT NOT NULL,
        before_snapshot_json TEXT,
        after_snapshot_json TEXT,
        created_at INTEGER NOT NULL,
        applied_at INTEGER,
        undone_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS project_ai_change_sets_project_idx
        ON project_ai_change_sets(project_id, created_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS project_ai_single_undoable_change_idx
        ON project_ai_change_sets(project_id) WHERE status = 'applied';

      CREATE TABLE IF NOT EXISTS project_ai_domain_skills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        version INTEGER NOT NULL CHECK (version > 0),
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(project_id, version)
      );

      CREATE TABLE IF NOT EXISTS project_weekly_checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        week_key TEXT NOT NULL CHECK (week_key GLOB '????-??-??'),
        scheduled_at INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'skipped')),
        report_message_id INTEGER REFERENCES project_ai_messages(id) ON DELETE SET NULL,
        created_at INTEGER NOT NULL,
        completed_at INTEGER,
        UNIQUE(project_id, week_key)
      );
      CREATE INDEX IF NOT EXISTS project_weekly_checks_due_idx
        ON project_weekly_checks(status, scheduled_at);
    `,
  },
  {
    version: 4,
    name: "weekly_check_retry_control",
    sql: `
      ALTER TABLE project_weekly_checks ADD COLUMN attempted_at INTEGER;
      CREATE INDEX IF NOT EXISTS project_weekly_checks_retry_idx
        ON project_weekly_checks(status, attempted_at, scheduled_at);
    `,
  },
  {
    version: 5,
    name: "multi_user_auth_and_data_isolation",
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 30),
        phone TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        failed_login_count INTEGER NOT NULL DEFAULT 0,
        locked_until INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS auth_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id, expires_at);

      INSERT OR IGNORE INTO users(
        id, name, phone, password_hash, is_active, created_at, updated_at
      ) VALUES (1, '待认领用户', '__legacy__', '!', 0, 0, 0);

      ALTER TABLE app_settings RENAME TO app_settings_legacy;
      CREATE TABLE app_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
        day_boundary_hour INTEGER NOT NULL DEFAULT 4 CHECK (day_boundary_hour BETWEEN 0 AND 23),
        daily_work_target_minutes INTEGER NOT NULL DEFAULT 330 CHECK (daily_work_target_minutes BETWEEN 0 AND 1439),
        weekly_workout_target INTEGER NOT NULL DEFAULT 3 CHECK (weekly_workout_target BETWEEN 0 AND 7),
        last_backup_at INTEGER,
        ai_provider TEXT NOT NULL DEFAULT 'none',
        ai_model TEXT,
        ai_base_url TEXT,
        ai_api_key TEXT,
        weekly_check_day INTEGER NOT NULL DEFAULT 1 CHECK (weekly_check_day BETWEEN 0 AND 6),
        weekly_check_hour INTEGER NOT NULL DEFAULT 13 CHECK (weekly_check_hour BETWEEN 0 AND 23),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      INSERT INTO app_settings(
        id, user_id, timezone, day_boundary_hour, daily_work_target_minutes,
        weekly_workout_target, last_backup_at, ai_provider, ai_model,
        ai_base_url, ai_api_key, weekly_check_day, weekly_check_hour,
        created_at, updated_at
      ) SELECT id, 1, timezone, day_boundary_hour, daily_work_target_minutes,
        weekly_workout_target, last_backup_at, ai_provider, ai_model,
        ai_base_url, ai_api_key, weekly_check_day, weekly_check_hour,
        created_at, updated_at FROM app_settings_legacy;
      DROP TABLE app_settings_legacy;

      ALTER TABLE daily_records RENAME TO daily_records_legacy;
      CREATE TABLE daily_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        record_date TEXT NOT NULL CHECK (record_date GLOB '????-??-??'),
        sleep_minutes INTEGER CHECK (sleep_minutes IS NULL OR sleep_minutes BETWEEN 0 AND 1440),
        work_target_minutes INTEGER NOT NULL CHECK (work_target_minutes BETWEEN 0 AND 1439),
        weekly_workout_target INTEGER NOT NULL CHECK (weekly_workout_target BETWEEN 0 AND 7),
        daily_state_code TEXT,
        daily_state_custom TEXT,
        day_summary TEXT,
        closed_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(user_id, record_date)
      );
      INSERT INTO daily_records SELECT id, 1, record_date, sleep_minutes,
        work_target_minutes, weekly_workout_target, daily_state_code,
        daily_state_custom, day_summary, closed_at, created_at, updated_at
        FROM daily_records_legacy;
      DROP TABLE daily_records_legacy;
      CREATE INDEX daily_records_user_date_idx ON daily_records(user_id, record_date);

      DROP TRIGGER IF EXISTS time_sessions_no_overlap_insert;
      DROP TRIGGER IF EXISTS time_sessions_no_overlap_update;
      DROP INDEX IF EXISTS time_sessions_single_running;
      DROP INDEX IF EXISTS time_sessions_date_kind_idx;
      ALTER TABLE time_sessions RENAME TO time_sessions_legacy;
      CREATE TABLE time_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('work', 'entertainment')),
        record_date TEXT NOT NULL CHECK (record_date GLOB '????-??-??'),
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        note TEXT,
        source TEXT NOT NULL CHECK (source IN ('timer', 'manual')),
        is_manually_edited INTEGER NOT NULL DEFAULT 0 CHECK (is_manually_edited IN (0, 1)),
        deleted_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        CHECK (ended_at IS NULL OR ended_at >= started_at)
      );
      INSERT INTO time_sessions SELECT id, 1, kind, record_date, started_at,
        ended_at, note, source, is_manually_edited, deleted_at, created_at, updated_at
        FROM time_sessions_legacy;
      DROP TABLE time_sessions_legacy;
      CREATE INDEX time_sessions_user_date_kind_idx
        ON time_sessions(user_id, record_date, kind, started_at);
      CREATE UNIQUE INDEX time_sessions_single_running_per_user
        ON time_sessions(user_id) WHERE ended_at IS NULL AND deleted_at IS NULL;
      CREATE TRIGGER time_sessions_no_overlap_insert
      BEFORE INSERT ON time_sessions
      WHEN NEW.deleted_at IS NULL AND EXISTS (
        SELECT 1 FROM time_sessions existing
        WHERE existing.user_id = NEW.user_id AND existing.deleted_at IS NULL
          AND NEW.started_at < COALESCE(existing.ended_at, 9223372036854775807)
          AND COALESCE(NEW.ended_at, 9223372036854775807) > existing.started_at
      )
      BEGIN SELECT RAISE(ABORT, 'SESSION_OVERLAP'); END;
      CREATE TRIGGER time_sessions_no_overlap_update
      BEFORE UPDATE OF started_at, ended_at, deleted_at ON time_sessions
      WHEN NEW.deleted_at IS NULL AND EXISTS (
        SELECT 1 FROM time_sessions existing
        WHERE existing.user_id = NEW.user_id AND existing.deleted_at IS NULL
          AND existing.id != NEW.id
          AND NEW.started_at < COALESCE(existing.ended_at, 9223372036854775807)
          AND COALESCE(NEW.ended_at, 9223372036854775807) > existing.started_at
      )
      BEGIN SELECT RAISE(ABORT, 'SESSION_OVERLAP'); END;

      ALTER TABLE body_records RENAME TO body_records_legacy;
      CREATE TABLE body_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        record_date TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('workout', 'light_activity', 'no_activity')),
        note TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(user_id, record_date)
      );
      INSERT INTO body_records SELECT id, 1, record_date, status, note, created_at, updated_at
        FROM body_records_legacy;
      DROP TABLE body_records_legacy;

      ALTER TABLE real_life_batch_items RENAME TO real_life_batch_items_legacy;
      ALTER TABLE real_life_batches RENAME TO real_life_batches_legacy;
      DROP INDEX IF EXISTS real_life_current_batch_idx;
      CREATE TABLE real_life_batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        record_date TEXT NOT NULL,
        replaced_at INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX real_life_current_batch_per_user_idx
        ON real_life_batches(user_id, record_date) WHERE replaced_at IS NULL;
      CREATE TABLE real_life_batch_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id INTEGER NOT NULL REFERENCES real_life_batches(id) ON DELETE CASCADE,
        suggestion_id INTEGER NOT NULL REFERENCES real_life_suggestions(id),
        position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 4),
        completed_at INTEGER,
        created_at INTEGER NOT NULL,
        UNIQUE(batch_id, suggestion_id),
        UNIQUE(batch_id, position)
      );
      INSERT INTO real_life_batches SELECT id, 1, record_date, replaced_at, created_at
        FROM real_life_batches_legacy;
      INSERT INTO real_life_batch_items SELECT id, batch_id, suggestion_id, position,
        completed_at, created_at FROM real_life_batch_items_legacy;
      DROP TABLE real_life_batch_items_legacy;
      DROP TABLE real_life_batches_legacy;

      ALTER TABLE todos ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
      UPDATE todos SET user_id = 1 WHERE user_id IS NULL;
      CREATE INDEX todos_user_idx ON todos(user_id, completed_at, created_at);

      ALTER TABLE projects ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
      UPDATE projects SET user_id = 1 WHERE user_id IS NULL;
      CREATE INDEX projects_user_idx ON projects(user_id, archived_at, created_at);

      ALTER TABLE wishes ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
      UPDATE wishes SET user_id = 1 WHERE user_id IS NULL;
      CREATE INDEX wishes_user_idx ON wishes(user_id, status, created_at);

      ALTER TABLE life_timelines ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
      UPDATE life_timelines SET user_id = 1 WHERE user_id IS NULL;
      CREATE INDEX life_timelines_user_idx ON life_timelines(user_id, created_at);
    `,
  },
  {
    version: 6,
    name: "todo_activity_history",
    sql: `
      CREATE TABLE todo_activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        task_id TEXT NOT NULL,
        occurrence_date TEXT,
        root_task_id TEXT NOT NULL,
        parent_task_id TEXT,
        action TEXT NOT NULL CHECK (action IN ('created','deferred_created','edited','completed','cancelled','deferred','deleted','reopened','status_changed')),
        occurred_at INTEGER NOT NULL,
        scheduled_date TEXT,
        title TEXT NOT NULL,
        previous_status TEXT,
        next_status TEXT,
        changed_fields TEXT NOT NULL DEFAULT '[]',
        source TEXT NOT NULL CHECK (source IN ('web','widget','desktop','mcp','unknown')),
        request_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        UNIQUE(user_id, request_id, sequence)
      );
      CREATE INDEX todo_activity_user_time_idx ON todo_activity(user_id, occurred_at, id);
      CREATE INDEX todo_activity_user_task_idx ON todo_activity(user_id, task_id, occurred_at);
      CREATE INDEX todo_activity_user_root_idx ON todo_activity(user_id, root_task_id, occurred_at);
      CREATE INDEX todo_activity_user_schedule_idx ON todo_activity(user_id, scheduled_date, action);
    `,
  },
  {
    version: 7,
    name: "todo_dashboard_layout",
    sql: `CREATE TABLE todo_dashboard_layouts (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      layout TEXT NOT NULL, revision INTEGER NOT NULL
    )`,
  },
] as const;
