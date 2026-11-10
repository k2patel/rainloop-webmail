//! Command line, process lifecycle, and wiring; mailbox behavior belongs in lib.

use std::{env, io, path::PathBuf, process::ExitCode};

use openmail::{
    DEFAULT_CONFIG_PATH, SYSTEM_CONFIG_DIR, VERSION, config::Config, sandbox, store::Store, web,
};
use tokio::{
    net::TcpListener,
    signal::unix::{SignalKind, signal},
};

enum Command {
    Help,
    Version,
    Run {
        path: Option<PathBuf>,
        check: bool,
        scan: bool,
    },
}

fn command() -> Result<Command, &'static str> {
    let mut args = env::args_os().skip(1).peekable();
    let mut path = None;
    let mut check = false;
    let mut scan = false;
    while let Some(arg) = args.next() {
        match arg.to_str() {
            Some("--help" | "-h") if path.is_none() && !check && !scan && args.peek().is_none() => {
                return Ok(Command::Help);
            }
            Some("--version") if path.is_none() && !check && !scan && args.peek().is_none() => {
                return Ok(Command::Version);
            }
            Some("-f" | "--config") if path.is_none() => {
                path = Some(PathBuf::from(
                    args.next().ok_or("-f requires a configuration path")?,
                ));
            }
            Some("-n" | "--check-config") if !check && !scan => check = true,
            Some("--scan") if !scan && !check => scan = true,
            _ => return Err("invalid arguments; use --help"),
        }
    }
    Ok(Command::Run { path, check, scan })
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("openmail: {error}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> io::Result<()> {
    let (path, check, scan) = match command()
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidInput, error))?
    {
        Command::Help => {
            println!("Usage: openmail [-n | --scan] [-f config] | --help | --version");
            println!("Run in the foreground; default configuration: {DEFAULT_CONFIG_PATH}");
            println!("Configuration must exist; use /etc/openmail for system settings.");
            println!("-n checks configuration without opening a listener.");
            println!(
                "--scan indexes a configured Maildir once, without serving HTTP or changing mail."
            );
            return Ok(());
        }
        Command::Version => {
            println!("OpenMail {VERSION}");
            return Ok(());
        }
        Command::Run { path, check, scan } => (path, check, scan),
    };
    let path = path.unwrap_or_else(|| PathBuf::from(DEFAULT_CONFIG_PATH));
    let config = Config::load(&path)
        .map_err(|error| io::Error::new(error.kind(), format!("{}: {error}", path.display())))?;
    if check {
        sandbox::configtest()?;
        println!("configuration OK (HTTP listener {})", config.http_listen);
        return Ok(());
    }
    if scan {
        let source = config.maildir.as_ref().ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidInput,
                "--scan requires a [maildir] configuration",
            )
        })?;
        let root = source.root.canonicalize()?;
        let database_parent = source
            .database
            .parent()
            .ok_or_else(|| {
                io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "database requires a parent directory",
                )
            })?
            .canonicalize()?;
        if database_parent.starts_with(&root) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Maildir database must be outside the source tree",
            ));
        }
        let settings_root = std::path::Path::new(SYSTEM_CONFIG_DIR)
            .canonicalize()
            .unwrap_or_else(|_| PathBuf::from(SYSTEM_CONFIG_DIR));
        if database_parent.starts_with(settings_root) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "writable database must be outside /etc/openmail",
            ));
        }
        // Resolve paths and permissions before opening SQLite or reading mail.
        sandbox::scan(&root, &source.database)?;
        let mut store = Store::open(&source.database).map_err(io::Error::other)?;
        let result = store.scan(&source.root).map_err(io::Error::other)?;
        println!(
            "indexed {} messages in {} mailboxes; state {}",
            result.messages, result.mailboxes, result.state
        );
        return Ok(());
    }

    // No worker threads are needed for the current status-only HTTP service.
    // Build the runtime before sealing the filesystem and syscall contracts.
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?
        .block_on(serve(config))
}

async fn serve(config: Config) -> io::Result<()> {
    // Register before opening the listener so startup cannot miss shutdown.
    let mut terminate = signal(SignalKind::terminate())?;
    let mut interrupt = signal(SignalKind::interrupt())?;
    let listener = TcpListener::bind(config.http_listen).await?;
    eprintln!("openmail: listening on http://{}", listener.local_addr()?);
    sandbox::http()?;
    let result = web::serve(listener, async move {
        tokio::select! {
            _ = terminate.recv() => {},
            _ = interrupt.recv() => {},
        }
        eprintln!("openmail: stopping");
    })
    .await;
    eprintln!("openmail: stopped");
    result
}
