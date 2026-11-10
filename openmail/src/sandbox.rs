//! OpenBSD process contracts. Other targets have no equivalent enforcement here.

use std::{io, path::Path};

/// Seal the filesystem and keep only stdio for configtest completion.
pub fn configtest() -> io::Result<()> {
    #[cfg(target_os = "openbsd")]
    native::no_files(false)?;
    Ok(())
}

/// Seal the filesystem after HTTP listener/runtime setup, retaining Internet sockets.
pub fn http() -> io::Result<()> {
    #[cfg(target_os = "openbsd")]
    native::no_files(true)?;
    Ok(())
}

/// Allow source reads and SQLite writes, without network or process creation.
/// Call before opening SQLite, after canonicalizing and validating configuration.
pub fn scan(root: &Path, database: &Path) -> io::Result<()> {
    #[cfg(target_os = "openbsd")]
    native::scan(root, database)?;
    #[cfg(not(target_os = "openbsd"))]
    let _ = (root, database);
    Ok(())
}

#[cfg(target_os = "openbsd")]
mod native {
    use priv_sep::{Permissions, Promise, Promises, unveil_no_more};
    use std::{io, path::Path};

    fn unveil(path: &Path, permissions: Permissions) -> io::Result<()> {
        permissions
            .unveil(path)
            .map_err(|error| io::Error::other(format!("unveil: {error}")))
    }

    fn pledge(promises: &[Promise]) -> io::Result<()> {
        Promises::new(promises)
            .pledge()
            .map_err(|error| io::Error::other(format!("pledge: {error}")))
    }

    pub(super) fn no_files(network: bool) -> io::Result<()> {
        // Locking an empty unveil list alone does not hide the filesystem.
        unveil(Path::new("/"), Permissions::NONE)?;
        unveil_no_more()?;
        if network {
            pledge(&[Promise::Stdio, Promise::Inet])
        } else {
            pledge(&[Promise::Stdio])
        }
    }

    pub(super) fn scan(root: &Path, database: &Path) -> io::Result<()> {
        let parent = database
            .parent()
            .ok_or_else(|| {
                io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "database needs a parent directory",
                )
            })?
            .canonicalize()?;
        let name = database.file_name().ok_or_else(|| {
            io::Error::new(io::ErrorKind::InvalidInput, "database needs a filename")
        })?;
        let database = parent.join(name);
        let root = root.canonicalize()?;
        if database.starts_with(&root) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "database must be outside Maildir",
            ));
        }
        // SQLite opens its containing directory for sync. Give that directory
        // read access, but write/create only to this database and its sidecars.
        unveil(&parent, Permissions::READ)?;
        unveil(&root, Permissions::READ)?;
        // SQLite's Unix VFS may seed its randomness from this device.
        unveil(Path::new("/dev/urandom"), Permissions::READ)?;
        let writable = Permissions::READ | Permissions::WRITE | Permissions::CREATE;
        for suffix in ["", "-journal", "-wal", "-shm"] {
            let mut path = database.as_os_str().to_os_string();
            path.push(suffix);
            unveil(Path::new(&path), writable)?;
        }
        unveil_no_more()?;
        pledge(&[
            Promise::Stdio,
            Promise::Rpath,
            Promise::Wpath,
            Promise::Cpath,
            Promise::Flock,
            Promise::Fattr,
        ])
    }
}
