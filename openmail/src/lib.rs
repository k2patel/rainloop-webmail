//! OpenMail's reusable application boundary.
//!
//! Keep mailbox rules here and process startup in the executable. Add concrete
//! modules as features are implemented; do not create a generic plugin or
//! database abstraction ahead of a demonstrated need.

pub mod config;
mod maildir;
pub mod sandbox;
pub mod store;
pub mod web;

/// The application version shared by the library and executable.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// System configuration directory. Runtime data belongs outside this directory.
pub const SYSTEM_CONFIG_DIR: &str = "/etc/openmail";

/// Required default configuration; command-line -f may select another file.
pub const DEFAULT_CONFIG_PATH: &str = "/etc/openmail/config.toml";
