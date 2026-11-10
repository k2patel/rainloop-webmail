//! Native kernel enforcement tests. Never sandbox the parent test process.
#![cfg(target_os = "openbsd")]

use std::{
    env, fs,
    net::TcpListener,
    os::unix::process::ExitStatusExt,
    path::PathBuf,
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

#[test]
fn sandbox_child() {
    let Ok(case) = env::var("OPENMAIL_SANDBOX_CASE") else {
        return;
    };
    let base = PathBuf::from(env::var_os("OPENMAIL_SANDBOX_DIR").unwrap());
    let root = base.join("mail");
    let database = base.join("db/index.sqlite");
    if case == "http-denies-files" {
        openmail::sandbox::http().unwrap();
        let _ = fs::read(root.join("message")); // pledge violation, SIGABRT
        panic!("HTTP filesystem access did not violate pledge");
    }
    openmail::sandbox::scan(&root, &database).unwrap();
    if case == "scan-denies-network" {
        let _ = TcpListener::bind("127.0.0.1:0"); // pledge violation, SIGABRT
        panic!("scanner network access did not violate pledge");
    }
    assert_eq!(fs::read(root.join("message")).unwrap(), b"mail");
    assert!(fs::write(root.join("message"), b"overwrite").is_err());
    assert!(fs::write(root.join("new-message"), b"new").is_err());
    assert!(fs::read("/etc/passwd").is_err());
    fs::write(&database, b"database").unwrap();
    fs::write(base.join("db/index.sqlite-journal"), b"journal").unwrap();
    assert!(fs::write(base.join("db/unrelated"), b"forbidden").is_err());
}

#[test]
fn kernel_enforces_source_and_network_contracts() {
    let base = env::temp_dir().join(format!(
        "openmail-sandbox-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(base.join("mail")).unwrap();
    fs::create_dir(base.join("db")).unwrap();
    fs::write(base.join("mail/message"), b"mail").unwrap();
    for case in ["scan-paths", "scan-denies-network", "http-denies-files"] {
        let result = Command::new(env::current_exe().unwrap())
            .args(["--exact", "sandbox_child", "--nocapture"])
            .env("OPENMAIL_SANDBOX_CASE", case)
            .env("OPENMAIL_SANDBOX_DIR", &base)
            .current_dir(&base)
            .output()
            .unwrap();
        if case == "scan-paths" {
            assert!(
                result.status.success(),
                "{}",
                String::from_utf8_lossy(&result.stderr)
            );
        } else {
            assert_eq!(result.status.signal(), Some(6), "{case}: {result:?}");
        }
    }
    assert_eq!(fs::read(base.join("mail/message")).unwrap(), b"mail");
    fs::remove_dir_all(base).unwrap();
}
