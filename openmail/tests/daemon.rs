//! Verify the actual executable's configuration, bind failure, and signal exit.

use std::{
    fs,
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    path::PathBuf,
    process::{Child, Command, Stdio},
    thread,
    time::{Duration, Instant},
};

struct Fixture {
    config: PathBuf,
    child: Option<Child>,
}

impl Drop for Fixture {
    fn drop(&mut self) {
        if let Some(child) = self.child.as_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
        let _ = fs::remove_file(&self.config);
        let _ = fs::remove_file(self.config.with_extension("daemon.log"));
    }
}

fn executable() -> Command {
    Command::new(env!("CARGO_BIN_EXE_openmail"))
}

#[test]
fn rejects_missing_nonregular_oversize_and_invalid_configuration() {
    let fixture = Fixture {
        config: std::env::temp_dir().join(format!(
            "openmail-config-validation-{}.toml",
            std::process::id()
        )),
        child: None,
    };
    for contents in [
        vec![b' '; 65537],
        vec![0xff],
        b"http_listen='127.0.0.1:8080'\nhttp_listen='127.0.0.1:8081'".to_vec(),
        b"[maildir]\nroot='/var/mail/alice'\ndatabase='/etc/openmail/index.sqlite'".to_vec(),
    ] {
        fs::write(&fixture.config, contents).unwrap();
        assert!(
            !executable()
                .arg("-n")
                .arg("-f")
                .arg(&fixture.config)
                .output()
                .unwrap()
                .status
                .success()
        );
    }
    assert!(
        !executable()
            .arg("-n")
            .arg("-f")
            .arg(std::env::temp_dir())
            .output()
            .unwrap()
            .status
            .success()
    );
    fs::remove_file(&fixture.config).unwrap();
    assert!(
        !executable()
            .arg("-n")
            .arg("-f")
            .arg(&fixture.config)
            .output()
            .unwrap()
            .status
            .success()
    );
}

#[test]
fn configuration_bind_and_sigterm_lifecycle() {
    let reserved = TcpListener::bind("127.0.0.1:0").unwrap();
    let address: SocketAddr = reserved.local_addr().unwrap();
    let mut fixture = Fixture {
        config: std::env::temp_dir().join(format!(
            "openmail-{}-{}.toml",
            std::process::id(),
            address.port()
        )),
        child: None,
    };
    fs::write(&fixture.config, "http_litsen = '127.0.0.1:8080'\n").unwrap();
    assert!(
        !executable()
            .arg("-n")
            .arg("-f")
            .arg(&fixture.config)
            .output()
            .unwrap()
            .status
            .success()
    );

    fs::write(&fixture.config, format!("http_listen = '{address}'\n")).unwrap();
    // Configtest must not bind: the reservation is still holding the port.
    assert!(
        executable()
            .arg("-n")
            .arg("-f")
            .arg(&fixture.config)
            .output()
            .unwrap()
            .status
            .success()
    );
    assert!(
        !executable()
            .arg("-f")
            .arg(&fixture.config)
            .output()
            .unwrap()
            .status
            .success()
    );
    drop(reserved);

    let log_path = fixture.config.with_extension("daemon.log");
    fixture.child = Some(
        executable()
            .arg("-f")
            .arg(&fixture.config)
            .stdout(Stdio::null())
            .stderr(Stdio::from(fs::File::create(&log_path).unwrap()))
            .spawn()
            .unwrap(),
    );
    let deadline = Instant::now() + Duration::from_secs(5);
    let mut connection = loop {
        // Wait for this process to announce its own listener. A successful
        // connect alone can race with teardown of the reserved test listener.
        let log = fs::read_to_string(&log_path).unwrap();
        if log.contains("openmail: listening on http://")
            && let Ok(connection) = TcpStream::connect_timeout(&address, Duration::from_millis(100))
        {
            break connection;
        }
        assert!(
            fixture
                .child
                .as_mut()
                .unwrap()
                .try_wait()
                .unwrap()
                .is_none(),
            "daemon exited before listening"
        );
        assert!(
            Instant::now() < deadline,
            "daemon did not open its listener"
        );
        thread::sleep(Duration::from_millis(20));
    };
    connection
        .set_read_timeout(Some(Duration::from_secs(2)))
        .unwrap();
    connection
        .set_write_timeout(Some(Duration::from_secs(2)))
        .unwrap();
    connection
        .write_all(b"GET /healthz HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
        .unwrap();
    let mut response = String::new();
    if let Err(error) = connection.read_to_string(&mut response) {
        let child = fixture.child.as_mut().unwrap();
        let status = child.try_wait().unwrap();
        if status.is_none() {
            let _ = child.kill();
            let _ = child.wait();
        }
        let log = fs::read_to_string(&log_path).unwrap();
        panic!("HTTP read failed: {error}; status {status:?}; response {response:?}; logs: {log}");
    }
    assert!(response.starts_with("HTTP/1.1 200"));
    drop(connection);

    let child = fixture.child.as_mut().unwrap();
    assert!(
        Command::new("kill")
            .arg("-TERM")
            .arg(child.id().to_string())
            .status()
            .unwrap()
            .success()
    );
    let deadline = Instant::now() + Duration::from_secs(12);
    loop {
        if let Some(status) = child.try_wait().unwrap() {
            assert!(
                status.success(),
                "daemon did not shut down cleanly: {status}"
            );
            break;
        }
        assert!(
            Instant::now() < deadline,
            "daemon did not exit after SIGTERM"
        );
        thread::sleep(Duration::from_millis(20));
    }
    assert!(TcpStream::connect_timeout(&address, Duration::from_millis(100)).is_err());
}
