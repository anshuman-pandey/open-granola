//! Local SQLite storage. Deletion clears application-visible data and compacts
//! the live database; it cannot erase filesystem snapshots, backups or SSD blocks.

use anyhow::{bail, Result};
use rusqlite::{config::DbConfig, Connection};
use std::path::Path;

pub struct Db {
    conn: Connection,
}

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    started_at TEXT NOT NULL,
    duration_s INTEGER NOT NULL,
    template TEXT,
    summary TEXT,
    chapters_json TEXT,
    decisions_json TEXT,
    starred INTEGER DEFAULT 0,
    expires_at TEXT
);
CREATE TABLE IF NOT EXISTS segments (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    start_ms INTEGER NOT NULL,
    end_ms INTEGER NOT NULL,
    speaker INTEGER NOT NULL,
    text TEXT NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS segments_fts USING fts5(text, content='segments', content_rowid='rowid');
CREATE TABLE IF NOT EXISTS action_items (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    owner TEXT,
    due TEXT,
    done INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS commitments (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    owner TEXT,
    due TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    made_on TEXT NOT NULL,
    evidence TEXT
);
CREATE INDEX IF NOT EXISTS idx_commitments_status ON commitments(status);
CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    author TEXT,
    prompt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS embeddings (
    segment_id TEXT PRIMARY KEY REFERENCES segments(id) ON DELETE CASCADE,
    vector BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"#;

// Version 0 shipped without foreign keys or FTS maintenance. Remove orphaned
// child data and rebuild the index before enabling delete/update triggers.
const MIGRATION_V1: &str = r#"
DELETE FROM embeddings WHERE segment_id NOT IN (SELECT id FROM segments);
DELETE FROM segments WHERE meeting_id NOT IN (SELECT id FROM meetings);
DELETE FROM action_items WHERE meeting_id NOT IN (SELECT id FROM meetings);
DELETE FROM commitments WHERE meeting_id NOT IN (SELECT id FROM meetings);
INSERT INTO segments_fts(segments_fts) VALUES('rebuild');
CREATE TRIGGER segments_ai AFTER INSERT ON segments BEGIN
    INSERT INTO segments_fts(rowid,text) VALUES(new.rowid,new.text);
END;
CREATE TRIGGER segments_ad AFTER DELETE ON segments BEGIN
    INSERT INTO segments_fts(segments_fts,rowid,text) VALUES('delete',old.rowid,old.text);
END;
CREATE TRIGGER segments_au AFTER UPDATE ON segments BEGIN
    INSERT INTO segments_fts(segments_fts,rowid,text) VALUES('delete',old.rowid,old.text);
    INSERT INTO segments_fts(rowid,text) VALUES(new.rowid,new.text);
END;
CREATE INDEX idx_segments_meeting ON segments(meeting_id);
CREATE INDEX idx_action_items_meeting ON action_items(meeting_id);
CREATE INDEX idx_commitments_meeting ON commitments(meeting_id);
CREATE INDEX idx_meetings_expiry ON meetings(expires_at);
CREATE TRIGGER meetings_retention_ai AFTER INSERT ON meetings BEGIN
    UPDATE meetings SET expires_at = CASE
        WHEN CAST((SELECT value FROM settings WHERE key='retention_days') AS INTEGER) BETWEEN 1 AND 36500
        THEN datetime(new.started_at, '+' || (SELECT value FROM settings WHERE key='retention_days') || ' days')
        ELSE NULL END WHERE id=new.id;
END;
UPDATE meetings SET expires_at = CASE
    WHEN CAST((SELECT value FROM settings WHERE key='retention_days') AS INTEGER) BETWEEN 1 AND 36500
    THEN datetime(started_at, '+' || (SELECT value FROM settings WHERE key='retention_days') || ' days')
    ELSE expires_at END;
PRAGMA user_version = 1;
"#;

const DELETE_EXPIRED: &str = "DELETE FROM meetings WHERE expires_at IS NOT NULL AND julianday(expires_at) <= julianday('now')";
const UPDATE_RETENTION: &str = "UPDATE meetings SET expires_at = CASE WHEN ?1 = 0 THEN NULL ELSE datetime(started_at, '+' || ?1 || ' days') END";
const PURGE: &str = r#"
DELETE FROM meetings;
DELETE FROM embeddings;
DELETE FROM action_items;
DELETE FROM commitments;
DELETE FROM segments;
DELETE FROM recipes;
DELETE FROM settings;
INSERT INTO segments_fts(segments_fts) VALUES('rebuild');
"#;

impl Db {
    pub fn open(path: &Path) -> Result<Self> {
        if path == Path::new(":memory:") {
            return Self::initialize(Connection::open_in_memory()?);
        }
        // Create with private permissions before SQLite creates its sidecars.
        // The containing application directory is also private on Unix.
        #[cfg(unix)]
        {
            use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
            let file = std::fs::OpenOptions::new()
                .read(true)
                .write(true)
                .create(true)
                .truncate(false)
                .mode(0o600)
                .open(path)?;
            file.set_permissions(std::fs::Permissions::from_mode(0o600))?;
        }
        Self::initialize(Connection::open(path)?)
    }

    fn initialize(conn: Connection) -> Result<Self> {
        conn.set_db_config(DbConfig::SQLITE_DBCONFIG_DEFENSIVE, true)?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        conn.execute_batch(
            "PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON; PRAGMA journal_mode=WAL; PRAGMA temp_store=MEMORY;",
        )?;
        let version: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
        if version > 1 {
            bail!("This library was created by a newer Open Granola version");
        }
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(SCHEMA)?;
        if version == 0 {
            tx.execute_batch(MIGRATION_V1)?;
        }
        // SQLite's ordinary secure_delete pragma alone does not clear deleted
        // FTS terms. This option is supported by our bundled SQLite (>=3.42).
        tx.execute_batch("INSERT INTO segments_fts(segments_fts,rank) VALUES('secure-delete',1);")?;
        tx.commit()?;
        let db = Self { conn };
        if version == 0 {
            db.compact()?;
        }
        db.enforce_retention()?;
        Ok(db)
    }

    /// Delete expired meetings and all dependent rows. SQLite parses timestamps
    /// so RFC3339 offsets and SQLite timestamps compare on the same UTC clock.
    pub fn enforce_retention(&self) -> Result<usize> {
        let tx = self.conn.unchecked_transaction()?;
        let count = tx.execute(DELETE_EXPIRED, [])?;
        tx.commit()?;
        if count > 0 {
            self.compact()?;
            log::info!("retention deleted {count} expired meeting(s)");
        }
        Ok(count)
    }

    /// Update the policy and existing expiry dates together. The insert trigger
    /// applies it to future captures/imports. Zero disables automatic deletion.
    pub fn set_retention_policy(&self, days: u32) -> Result<usize> {
        if days > 36_500 {
            bail!("Retention must be between 0 and 36500 days");
        }
        let tx = self.conn.unchecked_transaction()?;
        tx.execute(
            "INSERT INTO settings(key,value) VALUES('retention_days',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            [days.to_string()],
        )?;
        tx.execute(UPDATE_RETENTION, [days])?;
        let count = tx.execute(DELETE_EXPIRED, [])?;
        tx.commit()?;
        if count > 0 {
            self.compact()?;
        }
        Ok(count)
    }

    /// Clear all library tables while keeping SQLite open and usable. Never
    /// overwrite an open SQLite file: cached pages and WAL can restore old data.
    /// Model files are separate, manually installed assets and are not removed.
    pub fn purge_all(&mut self) -> Result<()> {
        let tx = self.conn.transaction()?;
        tx.execute_batch(PURGE)?;
        tx.commit()?;
        self.compact()
    }

    fn compact(&self) -> Result<()> {
        self.checkpoint()?;
        self.conn.execute_batch(
            "INSERT INTO segments_fts(segments_fts) VALUES('rebuild'); VACUUM;
             INSERT INTO segments_fts(segments_fts) VALUES('rebuild');",
        )?;
        // Rebuild again because VACUUM may change the implicit content rowids.
        self.checkpoint()
    }

    fn checkpoint(&self) -> Result<()> {
        let busy: i64 = self
            .conn
            .query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |row| row.get(0))?;
        if busy != 0 {
            bail!("Library rows were deleted, but another reader blocked log cleanup; close other instances and retry");
        }
        Ok(())
    }

    pub fn conn(&self) -> &Connection {
        &self.conn
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    fn memory_db() -> Db {
        Db::initialize(Connection::open_in_memory().unwrap()).unwrap()
    }

    fn seed(db: &Db, id: &str, started_at: &str) {
        db.conn.execute("INSERT INTO meetings(id,title,started_at,duration_s) VALUES(?1,'private title',?2,30)", params![id, started_at]).unwrap();
        db.conn.execute("INSERT INTO segments(id,meeting_id,start_ms,end_ms,speaker,text) VALUES(?1,?1,0,1000,0,'confidentialneedle')", [id]).unwrap();
        db.conn
            .execute(
                "INSERT INTO embeddings(segment_id,vector) VALUES(?1,x'01020304')",
                [id],
            )
            .unwrap();
        db.conn
            .execute(
                "INSERT INTO action_items(id,meeting_id,text) VALUES(?1,?1,'private action')",
                [id],
            )
            .unwrap();
        db.conn.execute("INSERT INTO commitments(id,meeting_id,text,made_on) VALUES(?1,?1,'private promise','2000-01-01')", [id]).unwrap();
    }

    fn count(db: &Db, table: &str) -> i64 {
        db.conn
            .query_row(&format!("SELECT count(*) FROM {table}"), [], |row| {
                row.get(0)
            })
            .unwrap()
    }

    fn matches(db: &Db, term: &str) -> i64 {
        db.conn
            .query_row(
                "SELECT count(*) FROM segments_fts WHERE segments_fts MATCH ?1",
                [term],
                |row| row.get(0),
            )
            .unwrap()
    }

    #[test]
    fn fts_tracks_inserts_updates_and_cascaded_deletes() {
        let db = memory_db();
        seed(&db, "one", "2000-01-01");
        assert_eq!(matches(&db, "confidentialneedle"), 1);
        db.conn
            .execute("UPDATE segments SET text='replacement' WHERE id='one'", [])
            .unwrap();
        assert_eq!(matches(&db, "confidentialneedle"), 0);
        assert_eq!(matches(&db, "replacement"), 1);
        db.conn
            .execute("DELETE FROM meetings WHERE id='one'", [])
            .unwrap();
        assert_eq!(matches(&db, "replacement"), 0);
        for table in ["segments", "embeddings", "action_items", "commitments"] {
            assert_eq!(count(&db, table), 0, "{table} must cascade");
        }
    }

    #[test]
    fn defensive_mode_rejects_direct_fts_shadow_table_modification() {
        let db = memory_db();
        seed(&db, "one", "2099-01-01");
        assert!(db
            .conn
            .execute("DELETE FROM segments_fts_data", [])
            .is_err());
        assert_eq!(matches(&db, "confidentialneedle"), 1);
    }

    #[test]
    fn retention_clears_existing_children_and_applies_to_new_meetings() {
        let db = memory_db();
        seed(&db, "old", "2000-01-01T10:00:00+05:30");
        assert_eq!(db.set_retention_policy(90).unwrap(), 1);
        assert_eq!(matches(&db, "confidentialneedle"), 0);
        for table in [
            "meetings",
            "segments",
            "embeddings",
            "action_items",
            "commitments",
        ] {
            assert_eq!(count(&db, table), 0);
        }
        seed(&db, "new", "2099-01-01T10:00:00+05:30");
        let expires: String = db
            .conn
            .query_row("SELECT expires_at FROM meetings", [], |row| row.get(0))
            .unwrap();
        assert_eq!(expires, "2099-04-01 04:30:00");
        db.set_retention_policy(0).unwrap();
        let expires: Option<String> = db
            .conn
            .query_row("SELECT expires_at FROM meetings", [], |row| row.get(0))
            .unwrap();
        assert!(expires.is_none());
        assert!(db.set_retention_policy(u32::MAX).is_err());
    }

    #[test]
    fn purge_clears_every_table_and_database_remains_usable_after_reopen() {
        let dir =
            std::env::temp_dir().join(format!("open-granola-storage-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&dir).unwrap();
        let path = dir.join("library.db");
        let mut db = Db::open(&path).unwrap();
        seed(&db, "old", "2000-01-01");
        db.conn
            .execute(
                "INSERT INTO recipes(id,name,prompt) VALUES('r','recipe','private prompt')",
                [],
            )
            .unwrap();
        db.conn
            .execute(
                "INSERT INTO settings(key,value) VALUES('test','private setting')",
                [],
            )
            .unwrap();
        db.purge_all().unwrap();
        for table in [
            "meetings",
            "segments",
            "embeddings",
            "action_items",
            "commitments",
            "recipes",
            "settings",
        ] {
            assert_eq!(count(&db, table), 0, "{table} must be empty");
        }
        assert_eq!(matches(&db, "confidentialneedle"), 0);
        assert_eq!(
            std::fs::metadata(path.with_extension("db-wal"))
                .unwrap()
                .len(),
            0
        );
        let bytes = std::fs::read(&path).unwrap();
        assert!(!bytes
            .windows(b"confidentialneedle".len())
            .any(|part| part == b"confidentialneedle"));
        seed(&db, "after", "2099-01-01");
        drop(db);
        let db = Db::open(&path).unwrap();
        assert_eq!(count(&db, "meetings"), 1);
        assert_eq!(matches(&db, "confidentialneedle"), 1);
        let integrity: String = db
            .conn
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .unwrap();
        assert_eq!(integrity, "ok");
        drop(db);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn legacy_migration_repairs_orphans_and_populates_search() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=OFF;").unwrap();
        conn.execute_batch(SCHEMA).unwrap();
        let legacy = Db { conn };
        seed(&legacy, "retained", "2099-01-01");
        seed(&legacy, "deleted", "2000-01-01");
        legacy
            .conn
            .execute("DELETE FROM meetings WHERE id='deleted'", [])
            .unwrap();
        let db = Db::initialize(legacy.conn).unwrap();
        for table in ["segments", "embeddings", "action_items", "commitments"] {
            assert_eq!(count(&db, table), 1, "repair {table}");
        }
        assert_eq!(matches(&db, "confidentialneedle"), 1);
        assert!(db
            .conn
            .execute(
                "INSERT INTO action_items(id,meeting_id,text) VALUES('bad','missing','bad')",
                []
            )
            .is_err());
    }

    #[test]
    fn retention_compaction_keeps_remaining_search_rows_consistent() {
        let db = memory_db();
        seed(&db, "expired", "2000-01-01");
        seed(&db, "retained", "2099-01-01");
        assert_eq!(db.set_retention_policy(90).unwrap(), 1);
        let id: String = db.conn.query_row(
            "SELECT s.id FROM segments_fts f JOIN segments s ON s.rowid=f.rowid WHERE segments_fts MATCH 'confidentialneedle'",
            [], |row| row.get(0),
        ).unwrap();
        assert_eq!(id, "retained");
        db.conn
            .execute_batch(
                "INSERT INTO segments_fts(segments_fts,rank) VALUES('integrity-check',1);",
            )
            .unwrap();
    }

    #[test]
    fn purge_reports_blocked_log_cleanup_and_can_be_retried() {
        let dir = std::env::temp_dir().join(format!("open-granola-busy-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&dir).unwrap();
        let path = dir.join("library.db");
        let mut db = Db::open(&path).unwrap();
        db.conn.busy_timeout(std::time::Duration::ZERO).unwrap();
        seed(&db, "old", "2000-01-01");
        let reader = Connection::open(&path).unwrap();
        reader
            .execute_batch("BEGIN; SELECT * FROM meetings;")
            .unwrap();
        let error = db.purge_all().unwrap_err();
        assert!(error.to_string().contains("blocked log cleanup"));
        assert_eq!(count(&db, "meetings"), 0);
        assert!(
            std::fs::metadata(path.with_extension("db-wal"))
                .unwrap()
                .len()
                > 0
        );
        reader.execute_batch("ROLLBACK;").unwrap();
        drop(reader);
        db.purge_all().unwrap();
        assert_eq!(
            std::fs::metadata(path.with_extension("db-wal"))
                .unwrap()
                .len(),
            0
        );
        drop(db);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
