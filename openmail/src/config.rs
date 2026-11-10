//! Strict service configuration. Mail source connections are configured later.

use std::{
    fs::File,
    io::{self, Read},
    net::SocketAddr,
    path::{Path, PathBuf},
};

use serde::Deserialize;

/// HTTP service settings. Absent settings use local-only defaults.
#[derive(Debug, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Config {
    pub http_listen: SocketAddr,
    pub maildir: Option<MaildirConfig>,
}

/// A single local source with a separate, private metadata database.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MaildirConfig {
    pub root: PathBuf,
    pub database: PathBuf,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            http_listen: SocketAddr::from(([127, 0, 0, 1], 8080)),
            maildir: None,
        }
    }
}

impl Config {
    /// Read an explicit configuration file; missing files are errors.
    pub fn load(path: &Path) -> io::Result<Self> {
        let file = File::from(rustix::fs::open(
            path,
            rustix::fs::OFlags::RDONLY | rustix::fs::OFlags::NONBLOCK | rustix::fs::OFlags::CLOEXEC,
            rustix::fs::Mode::empty(),
        )?);
        if !file.metadata()?.is_file() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "configuration must be a regular file",
            ));
        }
        let mut text = String::new();
        file.take(65537).read_to_string(&mut text)?;
        if text.len() > 65536 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "configuration exceeds 64 KiB",
            ));
        }
        Self::parse(&text)
    }

    fn parse(text: &str) -> io::Result<Self> {
        let config: Self = toml::from_str(text)
            .map_err(|error| io::Error::new(io::ErrorKind::InvalidInput, error.message()))?;
        if config.http_listen.port() == 0 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "http_listen requires a nonzero port",
            ));
        }
        if !config.http_listen.ip().is_loopback() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "http_listen must use a loopback address; expose HTTPS through relayd",
            ));
        }
        if let Some(source) = &config.maildir {
            if !source.root.is_absolute() || !source.database.is_absolute() {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "Maildir root and database must be absolute paths",
                ));
            }
            if source.database.starts_with(&source.root) {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "Maildir database must be outside the source tree",
                ));
            }
            if source.database.starts_with(crate::SYSTEM_CONFIG_DIR) {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "writable database must be outside /etc/openmail",
                ));
            }
        }
        Ok(config)
    }
}

#[cfg(test)]
mod tests {
    use super::Config;

    #[test]
    fn accepts_defaults_and_ipv6_loopback() {
        assert_eq!(
            Config::parse("").unwrap().http_listen.to_string(),
            "127.0.0.1:8080"
        );
        assert_eq!(
            Config::parse("http_listen = '[::1]:8081'")
                .unwrap()
                .http_listen
                .to_string(),
            "[::1]:8081"
        );
    }

    #[test]
    fn rejects_exposed_or_invalid_listeners_and_unknown_settings() {
        for value in [
            "http_listen = '0.0.0.0:8080'",
            "http_listen = '[::]:8080'",
            "http_listen = '192.0.2.10:8080'",
            "http_listen = 'localhost:8080'",
            "http_listen = '127.0.0.1:0'",
            "http_litsen = '127.0.0.1:8080'",
            "[broken",
            "[maildir]\nroot='relative'\ndatabase='/var/db/openmail.sqlite'",
            "[maildir]\nroot='/var/mail/alice'\ndatabase='/var/mail/alice/index.sqlite'",
            "[maildir]\nroot='/var/mail/alice'",
        ] {
            assert!(Config::parse(value).is_err(), "accepted: {value}");
        }
    }
}
