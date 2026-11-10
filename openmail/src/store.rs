//! Authoritative local IDs and scan changes. Original Maildir files are never written.

use std::{
    io,
    path::{Path, PathBuf},
    time::Duration,
};

use rusqlite::{
    Connection, OpenFlags, OptionalExtension, Transaction, TransactionBehavior, params,
};
use rustix::fs::{self, Mode, OFlags};

use crate::maildir;

type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;

/// A private SQLite index for exactly one configured source root.
pub struct Store {
    connection: Connection,
    database: PathBuf,
}

/// An indexed message. Paths and IDs are local library data, not public API output.
#[derive(Debug)]
pub struct Message {
    pub id: String,
    pub mailbox_id: String,
    pub path: String,
    pub flags: String,
    pub sha256: String,
    pub size: i64,
}

/// Summary of a committed reconciliation, with its local journal position.
#[derive(Debug)]
pub struct Scan {
    pub mailboxes: usize,
    pub messages: usize,
    pub state: i64,
}

impl Store {
    /// Open or create an index in an existing private directory. Files default to 0600.
    pub fn open(path: &Path) -> Result<Self> {
        let fd = fs::open(
            path,
            OFlags::RDWR | OFlags::CREATE | OFlags::NOFOLLOW | OFlags::CLOEXEC,
            Mode::RUSR | Mode::WUSR,
        )?;
        if !std::fs::File::from(fd).metadata()?.is_file() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "database must be a regular file",
            )
            .into());
        }
        let mut connection = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NOFOLLOW,
        )?;
        connection.busy_timeout(Duration::from_secs(5))?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        // Sandboxed scans must never need an arbitrary /tmp spill file.
        connection.pragma_update(None, "temp_store", "MEMORY")?;
        let tx = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let app: i64 = tx.pragma_query_value(None, "application_id", |row| row.get(0))?;
        let version: i64 = tx.pragma_query_value(None, "user_version", |row| row.get(0))?;
        if app == 0 && version == 0 {
            let tables: i64 = tx.query_row(
                "SELECT count(*) FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'",
                [],
                |row| row.get(0),
            )?;
            if tables != 0 {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "refusing unrelated SQLite database",
                )
                .into());
            }
            tx.execute_batch(include_str!("schema.sql"))?;
        } else if app != 1330463052 || version != 1 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "unsupported OpenMail database schema",
            )
            .into());
        }
        tx.commit()?;
        Ok(Self {
            connection,
            database: path.canonicalize()?,
        })
    }

    /// Collect the entire source before updating rows. Any scan/SQL error preserves
    /// the previous committed index. No mail content is exposed to the HTTP server.
    pub fn scan(&mut self, root: &Path) -> Result<Scan> {
        // Lock before collecting the snapshot so concurrent scans cannot commit
        // an older snapshot after a newer one.
        let tx = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let canonical = root.canonicalize()?;
        if self.database.starts_with(&canonical) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Maildir database must be outside the source tree",
            )
            .into());
        }
        let snapshot = maildir::snapshot(root)?;
        let root = canonical.to_str().ok_or_else(|| {
            io::Error::new(io::ErrorKind::InvalidInput, "Maildir root must be UTF-8")
        })?;
        let bound: Option<String> = tx
            .query_row("SELECT value FROM settings WHERE name='root'", [], |row| {
                row.get(0)
            })
            .optional()?;
        if let Some(bound) = bound {
            if bound != root {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "database belongs to a different Maildir root",
                )
                .into());
            }
        } else {
            tx.execute("INSERT INTO settings(name,value) VALUES('root',?1)", [root])?;
        }
        tx.execute("UPDATE mailboxes SET seen=0 WHERE live=1", [])?;
        tx.execute("UPDATE messages SET seen=0 WHERE live=1", [])?;
        for folder in &snapshot.folders {
            let existing: Option<String> = tx
                .query_row(
                    "SELECT id FROM mailboxes WHERE source_key=?1 AND live=1",
                    [folder],
                    |row| row.get(0),
                )
                .optional()?;
            if let Some(id) = existing {
                tx.execute("UPDATE mailboxes SET seen=1 WHERE id=?1", [&id])?;
            } else {
                tx.execute("INSERT INTO mailboxes(source_key) VALUES(?1)", [folder])?;
                let id: String = tx.query_row(
                    "SELECT id FROM mailboxes WHERE source_key=?1 AND live=1",
                    [folder],
                    |row| row.get(0),
                )?;
                event(&tx, "Mailbox", &id, "created")?;
            }
        }
        for message in &snapshot.messages {
            let mailbox: String = tx.query_row(
                "SELECT id FROM mailboxes WHERE source_key=?1 AND live=1",
                [&message.folder],
                |row| row.get(0),
            )?;
            let old: Option<(String,String,String)> = tx.query_row("SELECT id,sha256,flags FROM messages WHERE mailbox_id=?1 AND source_key=?2 AND live=1",
                params![mailbox,message.key], |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?))).optional()?;
            if let Some((id, hash, flags)) = old {
                if hash == message.hash {
                    tx.execute(
                        "UPDATE messages SET seen=1,flags=?1,path=?2 WHERE id=?3",
                        params![message.flags, message.path, id],
                    )?;
                    if flags != message.flags {
                        event(&tx, "Email", &id, "updated")?;
                    }
                    // A new/cur rename with unchanged flags is only a locator update.
                    continue;
                }
                tx.execute("UPDATE messages SET live=0 WHERE id=?1", [&id])?;
                event(&tx, "Email", &id, "destroyed")?;
            }
            tx.execute("INSERT INTO messages(mailbox_id,source_key,path,flags,sha256,size) VALUES(?1,?2,?3,?4,?5,?6)",
                params![mailbox,message.key,message.path,message.flags,message.hash,i64::try_from(message.size)?])?;
            let id: String = tx.query_row(
                "SELECT id FROM messages WHERE mailbox_id=?1 AND source_key=?2 AND live=1",
                params![mailbox, message.key],
                |row| row.get(0),
            )?;
            event(&tx, "Email", &id, "created")?;
        }
        for (table, kind) in [("messages", "Email"), ("mailboxes", "Mailbox")] {
            let ids: Vec<String> = tx
                .prepare(&format!(
                    "SELECT id FROM {table} WHERE live=1 AND seen=0 ORDER BY id"
                ))?
                .query_map([], |row| row.get(0))?
                .collect::<rusqlite::Result<_>>()?;
            for id in ids {
                tx.execute(&format!("UPDATE {table} SET live=0 WHERE id=?1"), [&id])?;
                event(&tx, kind, &id, "destroyed")?;
            }
        }
        let state = tx.query_row("SELECT coalesce(max(sequence),0) FROM changes", [], |row| {
            row.get(0)
        })?;
        tx.commit()?;
        Ok(Scan {
            mailboxes: snapshot.folders.len(),
            messages: snapshot.messages.len(),
            state,
        })
    }

    /// List current metadata. Raw messages remain in the source Maildir.
    pub fn messages(&self) -> Result<Vec<Message>> {
        Ok(self.connection.prepare("SELECT id,mailbox_id,path,flags,sha256,size FROM messages WHERE live=1 ORDER BY path")?
            .query_map([], |row| Ok(Message { id: row.get(0)?, mailbox_id: row.get(1)?, path: row.get(2)?, flags: row.get(3)?, sha256: row.get(4)?, size: row.get(5)? }))?
            .collect::<rusqlite::Result<_>>()?)
    }
}

fn event(tx: &Transaction<'_>, kind: &str, id: &str, operation: &str) -> rusqlite::Result<()> {
    tx.execute(
        "INSERT INTO changes(kind,object_id,operation) VALUES(?1,?2,?3)",
        params![kind, id, operation],
    )?;
    Ok(())
}
