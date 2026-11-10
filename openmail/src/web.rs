//! HTTP service boundary; no mailbox capability is advertised yet.

use std::{
    future::{Future, IntoFuture},
    io,
    time::Duration,
};

use axum::{Router, http::StatusCode, routing::get};
use tokio::{net::TcpListener, sync::oneshot};

/// Serve until shutdown, then allow up to ten seconds for requests to finish.
pub async fn serve(
    listener: TcpListener,
    shutdown: impl Future<Output = ()> + Send,
) -> io::Result<()> {
    let app = Router::new()
        .route(
            "/",
            get(|| async { "OpenMail\nMailbox services are not configured yet.\n" }),
        )
        .route("/healthz", get(|| async { "ok\n" }))
        .route(
            "/readyz",
            get(|| async {
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    "mailbox services unavailable\n",
                )
            }),
        );
    let (stop, stopped) = oneshot::channel::<()>();
    let server = axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = stopped.await;
        })
        .into_future();
    tokio::pin!(server);
    tokio::pin!(shutdown);

    tokio::select! {
        result = &mut server => return result,
        () = &mut shutdown => {}
    }
    let _ = stop.send(());
    tokio::time::timeout(Duration::from_secs(10), &mut server)
        .await
        .map_err(|_| io::Error::new(io::ErrorKind::TimedOut, "HTTP shutdown timed out"))?
}

#[cfg(test)]
mod tests {
    use super::serve;
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::{TcpListener, TcpStream},
        sync::oneshot,
    };

    #[tokio::test]
    async fn reports_liveness_without_claiming_mailbox_readiness_and_stops() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let (stop, stopped) = oneshot::channel::<()>();
        let task = tokio::spawn(serve(listener, async {
            let _ = stopped.await;
        }));
        for (path, status) in [
            ("/", 200),
            ("/healthz", 200),
            ("/readyz", 503),
            ("/.well-known/jmap", 404),
        ] {
            let mut connection = TcpStream::connect(address).await.unwrap();
            connection
                .write_all(
                    format!("GET {path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
                        .as_bytes(),
                )
                .await
                .unwrap();
            let mut response = String::new();
            connection.read_to_string(&mut response).await.unwrap();
            assert!(
                response.starts_with(&format!("HTTP/1.1 {status}")),
                "{response}"
            );
        }
        stop.send(()).unwrap();
        task.await.unwrap().unwrap();
        assert!(TcpStream::connect(address).await.is_err());
    }
}
