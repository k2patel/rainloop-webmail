//! Exercise the scanner against real directories, files, renames, and SQLite.

use std::{
    fs,
    os::unix::{
        fs::{PermissionsExt, symlink},
        net::UnixListener,
    },
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

use openmail::store::Store;

struct Fixture {
    base: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let base = std::env::temp_dir().join(format!(
            "openmail-maildir-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&base).unwrap();
        let result = Self { base };
        result.folder("mail");
        result
    }
    fn folder(&self, name: &str) {
        for location in ["tmp", "new", "cur"] {
            fs::create_dir_all(self.base.join(name).join(location)).unwrap();
        }
    }
    fn root(&self) -> PathBuf {
        self.base.join("mail")
    }
    fn database(&self) -> PathBuf {
        self.base.join("metadata.sqlite")
    }
    fn store(&self) -> Store {
        Store::open(&self.database()).unwrap()
    }
    fn deliver(&self, path: &str) {
        // A real RFC 5322/MIME message with an attachment; same content for all
        // deliveries deliberately verifies that a hash is not an Email identity.
        fs::write(self.root().join(path), sample()).unwrap();
    }
}

fn sample() -> Vec<u8> {
    let repo = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
    let relative = "openmail-draft/accounts/acct_demo/blobs/d2/d27e8dae1f5a9e5c4598e58872b74b00800964c0d3d2bf97dee73f3c6e1ee5d4.eml";
    fs::read(repo.join("tests/fixtures").join(relative)).unwrap()
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.base);
    }
}

#[test]
fn preserves_ids_and_journal_across_restart_delivery_and_flags() {
    let fixture = Fixture::new();
    fixture.folder("mail/.Archive.Sub");
    fixture.deliver("new/delivery.1");
    fixture.deliver("tmp/incomplete");
    let mut store = fixture.store();
    let first = store.scan(&fixture.root()).unwrap();
    assert_eq!((first.messages, first.mailboxes), (1, 2));
    let message = store.messages().unwrap().remove(0);
    assert_eq!(message.size, sample().len() as i64);
    assert_eq!(
        message.sha256,
        "d27e8dae1f5a9e5c4598e58872b74b00800964c0d3d2bf97dee73f3c6e1ee5d4"
    );
    assert_eq!(
        fs::metadata(fixture.database())
            .unwrap()
            .permissions()
            .mode()
            & 0o777,
        0o600
    );
    drop(store);
    fs::rename(
        fixture.root().join("new/delivery.1"),
        fixture.root().join("cur/delivery.1:2,"),
    )
    .unwrap();
    let mut store = fixture.store();
    assert_eq!(store.scan(&fixture.root()).unwrap().state, first.state);
    assert_eq!(store.messages().unwrap()[0].id, message.id);
    fs::rename(
        fixture.root().join("cur/delivery.1:2,"),
        fixture.root().join("cur/delivery.1:2,SSFR"),
    )
    .unwrap();
    let flags_state = store.scan(&fixture.root()).unwrap().state;
    assert!(flags_state > first.state);
    let current = store.messages().unwrap().remove(0);
    assert_eq!(current.id, message.id);
    assert_eq!(current.mailbox_id, message.mailbox_id);
    assert_eq!(current.flags, "FRS");
    assert_eq!(store.scan(&fixture.root()).unwrap().state, flags_state);
    fixture.deliver("new/delivery.2");
    let second = store.scan(&fixture.root()).unwrap();
    assert_eq!(second.messages, 2);
    let messages = store.messages().unwrap();
    assert_ne!(messages[0].id, messages[1].id);
    assert_eq!(messages[0].sha256, messages[1].sha256);
    assert_eq!(
        fs::read(fixture.root().join("cur/delivery.1:2,SSFR")).unwrap(),
        sample()
    );
    assert!(fixture.root().join("tmp/incomplete").exists());
}

#[test]
fn deletion_recreation_and_replaced_content_never_reuse_ids() {
    let fixture = Fixture::new();
    fixture.deliver("new/one");
    let mut store = fixture.store();
    store.scan(&fixture.root()).unwrap();
    let id = store.messages().unwrap()[0].id.clone();
    fs::write(
        fixture.root().join("new/one"),
        b"Subject: different\r\n\r\nchanged\r\n",
    )
    .unwrap();
    store.scan(&fixture.root()).unwrap();
    let replaced = store.messages().unwrap()[0].id.clone();
    assert_ne!(id, replaced);
    fs::remove_file(fixture.root().join("new/one")).unwrap();
    let deleted = store.scan(&fixture.root()).unwrap();
    assert!(store.messages().unwrap().is_empty());
    fixture.deliver("new/one");
    assert!(store.scan(&fixture.root()).unwrap().state > deleted.state);
    let new = store.messages().unwrap()[0].id.clone();
    assert_ne!(new, id);
    assert_ne!(new, replaced);
    let db = rusqlite::Connection::open(fixture.database()).unwrap();
    let destroyed: i64 = db
        .query_row(
            "SELECT count(*) FROM changes WHERE kind='Email' AND operation='destroyed'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(destroyed, 2);
}

#[test]
fn failed_scans_keep_previous_index_and_do_not_follow_symlinks() {
    let fixture = Fixture::new();
    fixture.deliver("new/one");
    let mut store = fixture.store();
    let initial = store.scan(&fixture.root()).unwrap();
    let id = store.messages().unwrap()[0].id.clone();
    fs::remove_dir(fixture.root().join("cur")).unwrap();
    assert!(store.scan(&fixture.root()).is_err());
    assert_eq!(store.messages().unwrap()[0].id, id);
    fs::create_dir(fixture.root().join("cur")).unwrap();
    fixture.folder("mail/.Archive");
    fs::remove_dir(fixture.root().join(".Archive/new")).unwrap();
    assert!(store.scan(&fixture.root()).is_err());
    fs::remove_dir_all(fixture.root().join(".Archive")).unwrap();
    symlink(fixture.base.join("secret"), fixture.root().join("new/link")).unwrap();
    fs::write(fixture.base.join("secret"), b"private").unwrap();
    assert!(store.scan(&fixture.root()).is_err());
    fs::remove_file(fixture.root().join("new/link")).unwrap();
    let _socket = UnixListener::bind(fixture.root().join("new/socket")).unwrap();
    assert!(store.scan(&fixture.root()).is_err());
    fs::remove_file(fixture.root().join("new/socket")).unwrap();
    fixture.deliver("cur/one:2,S");
    assert!(store.scan(&fixture.root()).is_err());
    fs::remove_file(fixture.root().join("cur/one:2,S")).unwrap();
    assert_eq!(store.scan(&fixture.root()).unwrap().state, initial.state);
    assert_eq!(store.messages().unwrap()[0].id, id);
}

#[test]
fn rejects_wrong_source_and_unrelated_database() {
    let fixture = Fixture::new();
    fixture.deliver("new/one");
    let mut store = fixture.store();
    store.scan(&fixture.root()).unwrap();
    fixture.folder("another");
    assert!(store.scan(&fixture.base.join("another")).is_err());
    assert_eq!(store.messages().unwrap().len(), 1);
    let unrelated = fixture.base.join("unrelated.sqlite");
    let db = rusqlite::Connection::open(&unrelated).unwrap();
    db.execute("CREATE TABLE existing (id INTEGER)", [])
        .unwrap();
    assert!(Store::open(&unrelated).is_err());
    let version: i64 = db
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap();
    assert_eq!(version, 0);
    let link = fixture.base.join("linked.sqlite");
    symlink(fixture.database(), &link).unwrap();
    assert!(Store::open(&link).is_err());
}

#[test]
fn scan_command_uses_config_and_does_not_start_http() {
    let fixture = Fixture::new();
    fixture.deliver("new/one");
    let config = fixture.base.join("config.toml");
    fs::write(
        &config,
        format!(
            "[maildir]\nroot = {:?}\ndatabase = {:?}\n",
            fixture.root(),
            fixture.database()
        ),
    )
    .unwrap();
    let result = Command::new(env!("CARGO_BIN_EXE_openmail"))
        .arg("--scan")
        .arg("-f")
        .arg(&config)
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    assert!(String::from_utf8_lossy(&result.stdout).contains("indexed 1 messages in 1 mailboxes"));
}

#[test]
fn sql_failure_rolls_back_metadata_and_journal_together() {
    let fixture = Fixture::new();
    fixture.deliver("new/one");
    let mut store = fixture.store();
    let initial = store.scan(&fixture.root()).unwrap();
    let id = store.messages().unwrap()[0].id.clone();
    let db = rusqlite::Connection::open(fixture.database()).unwrap();
    db.execute_batch("CREATE TRIGGER fail_change BEFORE INSERT ON changes BEGIN SELECT RAISE(ABORT, 'simulated journal failure'); END;").unwrap();
    fs::rename(
        fixture.root().join("new/one"),
        fixture.root().join("cur/one:2,S"),
    )
    .unwrap();
    assert!(store.scan(&fixture.root()).is_err());
    let unchanged = store.messages().unwrap().remove(0);
    assert_eq!(unchanged.id, id);
    assert_eq!(unchanged.flags, "");
    let state: i64 = db
        .query_row("SELECT max(sequence) FROM changes", [], |row| row.get(0))
        .unwrap();
    assert_eq!(state, initial.state);
    db.execute_batch("DROP TRIGGER fail_change").unwrap();
    assert!(store.scan(&fixture.root()).unwrap().state > initial.state);
    let updated = store.messages().unwrap().remove(0);
    assert_eq!(updated.id, id);
    assert_eq!(updated.flags, "S");
}

#[test]
fn scan_rejects_database_parent_alias_into_maildir_before_creating_files() {
    let fixture = Fixture::new();
    symlink(fixture.root(), fixture.base.join("alias")).unwrap();
    let config = fixture.base.join("config.toml");
    fs::write(
        &config,
        format!(
            "[maildir]\nroot = {:?}\ndatabase = {:?}\n",
            fixture.root(),
            fixture.base.join("alias/index.sqlite")
        ),
    )
    .unwrap();
    let result = Command::new(env!("CARGO_BIN_EXE_openmail"))
        .arg("--scan")
        .arg("-f")
        .arg(&config)
        .output()
        .unwrap();
    assert!(!result.status.success());
    assert!(!fixture.root().join("index.sqlite").exists());
}
