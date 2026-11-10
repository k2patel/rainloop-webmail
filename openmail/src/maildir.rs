//! Read-only Maildir++ snapshots, using directory-relative opens without symlinks.

use std::{
    collections::BTreeSet,
    fs::File,
    io::{self, Read},
    os::fd::{AsFd, OwnedFd},
    os::unix::fs::MetadataExt,
    path::Path,
};

use rustix::fs::{self, AtFlags, Dir, FileType, Mode, OFlags};
use sha2::{Digest, Sha256};

const MAX_MESSAGE_BYTES: u64 = 64 * 1024 * 1024;

pub(crate) struct Snapshot {
    pub folders: Vec<String>,
    pub messages: Vec<Message>,
}

pub(crate) struct Message {
    pub folder: String,
    pub key: String,
    pub path: String,
    pub flags: String,
    pub hash: String,
    pub size: u64,
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

fn directory(parent: impl AsFd, name: impl rustix::path::Arg) -> io::Result<OwnedFd> {
    Ok(fs::openat(
        parent,
        name,
        OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC,
        Mode::empty(),
    )?)
}

fn names(fd: &OwnedFd) -> io::Result<Vec<String>> {
    let mut result = Vec::new();
    for entry in Dir::read_from(fd)? {
        let entry = entry?;
        let name = entry
            .file_name()
            .to_str()
            .map_err(|_| invalid("Maildir names must be UTF-8"))?;
        if name != "." && name != ".." {
            result.push(name.to_owned());
        }
    }
    result.sort();
    Ok(result)
}

pub(crate) fn snapshot(root: &Path) -> io::Result<Snapshot> {
    let rootfd = fs::open(
        root,
        OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC,
        Mode::empty(),
    )?;
    let mut result = Snapshot {
        folders: vec![".".to_owned()],
        messages: Vec::new(),
    };
    scan_folder(&rootfd, ".", &mut result.messages)?;
    for name in names(&rootfd)? {
        if !name.starts_with('.') {
            continue;
        }
        let stat = fs::statat(&rootfd, name.as_str(), AtFlags::SYMLINK_NOFOLLOW)?;
        if FileType::from_raw_mode(stat.st_mode) != FileType::Directory {
            continue;
        }
        let folder = directory(&rootfd, name.as_str())?;
        let mut maildir_marker = false;
        for location in ["new", "cur", "tmp"] {
            match fs::statat(&folder, location, AtFlags::SYMLINK_NOFOLLOW) {
                Err(rustix::io::Errno::NOENT) => continue,
                Err(error) => return Err(error.into()),
                Ok(_) => {
                    maildir_marker = true;
                    break;
                }
            }
        }
        if !maildir_marker {
            continue; // unrelated hidden directory with no Maildir structure
        }
        scan_folder(&folder, &name, &mut result.messages)?;
        result.folders.push(name);
    }
    result.folders.sort();
    result
        .messages
        .sort_by(|a, b| (&a.folder, &a.key).cmp(&(&b.folder, &b.key)));
    Ok(result)
}

fn scan_folder(folder: &OwnedFd, folder_name: &str, messages: &mut Vec<Message>) -> io::Result<()> {
    // A complete Maildir must have all three directories, even though tmp is ignored.
    let _tmp = directory(folder, "tmp")?;
    let mut keys = BTreeSet::new();
    for location in ["new", "cur"] {
        let dir = directory(folder, location)?;
        for name in names(&dir)? {
            if name.starts_with('.') {
                continue; // Maildir delivery convention ignores hidden files
            }
            let (key, flags) = match name.split_once(':') {
                None => (name.as_str(), ""),
                Some((key, suffix)) => (
                    key,
                    suffix
                        .strip_prefix("2,")
                        .ok_or_else(|| invalid("unsupported Maildir info suffix"))?,
                ),
            };
            if key.is_empty() || !flags.bytes().all(|value| value.is_ascii_alphabetic()) {
                return Err(invalid("invalid Maildir key or flags"));
            }
            if !keys.insert(key.to_owned()) {
                return Err(invalid(
                    "ambiguous duplicate Maildir key; retry after delivery settles",
                ));
            }
            let fd = fs::openat(
                &dir,
                name.as_str(),
                OFlags::RDONLY | OFlags::NOFOLLOW | OFlags::NONBLOCK | OFlags::CLOEXEC,
                Mode::empty(),
            )?;
            let mut file = File::from(fd);
            let before = file.metadata()?;
            if !before.is_file() || before.len() > MAX_MESSAGE_BYTES {
                return Err(invalid(
                    "Maildir entry must be a regular file of at most 64 MiB",
                ));
            }
            let mut digest = Sha256::new();
            let mut buffer = [0u8; 65536];
            let mut size = 0;
            loop {
                let count = file.read(&mut buffer)?;
                if count == 0 {
                    break;
                }
                size += count as u64;
                if size > MAX_MESSAGE_BYTES {
                    return Err(invalid("message grew beyond 64 MiB"));
                }
                digest.update(&buffer[..count]);
            }
            let after = file.metadata()?;
            if size != before.len()
                || before.len() != after.len()
                || before.mtime() != after.mtime()
                || before.mtime_nsec() != after.mtime_nsec()
                || before.ctime() != after.ctime()
                || before.ctime_nsec() != after.ctime_nsec()
            {
                return Err(invalid("message changed during scan; retry"));
            }
            let normalized_flags: String =
                flags.chars().collect::<BTreeSet<_>>().into_iter().collect();
            let path = if folder_name == "." {
                format!("{location}/{name}")
            } else {
                format!("{folder_name}/{location}/{name}")
            };
            messages.push(Message {
                folder: folder_name.to_owned(),
                key: key.to_owned(),
                path,
                flags: normalized_flags,
                hash: digest
                    .finalize()
                    .iter()
                    .map(|byte| format!("{byte:02x}"))
                    .collect(),
                size,
            });
        }
    }
    Ok(())
}
