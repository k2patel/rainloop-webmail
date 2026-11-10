-- First OpenMail source-index schema; both identifiers mark this file's format.
PRAGMA application_id = 1330463052;
PRAGMA user_version = 1;
CREATE TABLE settings (name TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE mailboxes (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    source_key TEXT NOT NULL,
    live INTEGER NOT NULL DEFAULT 1 CHECK(live IN (0,1)),
    seen INTEGER NOT NULL DEFAULT 1 CHECK(seen IN (0,1))
);
CREATE UNIQUE INDEX active_mailbox ON mailboxes(source_key) WHERE live=1;
CREATE TABLE messages (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    mailbox_id TEXT NOT NULL REFERENCES mailboxes(id),
    source_key TEXT NOT NULL,
    path TEXT NOT NULL,
    flags TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    size INTEGER NOT NULL CHECK(size>=0),
    live INTEGER NOT NULL DEFAULT 1 CHECK(live IN (0,1)),
    seen INTEGER NOT NULL DEFAULT 1 CHECK(seen IN (0,1))
);
CREATE UNIQUE INDEX active_message ON messages(mailbox_id,source_key) WHERE live=1;
CREATE TABLE changes (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK(kind IN ('Email','Mailbox')),
    object_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK(operation IN ('created','updated','destroyed'))
);
