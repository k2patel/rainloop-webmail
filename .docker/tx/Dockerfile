# The current Go-based client replaces the retired Python 3.6 client.
FROM debian:trixie-slim AS download
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
RUN set -eu; \
    case "$TARGETARCH" in \
      amd64) checksum=002dec5b9e71248a7e6a0808118e9da940205828d5a33ce88e04bb57a967164d ;; \
      arm64) checksum=c380ed9aece5d34316aa0fe2e5afa0633553656f98909f88cb72609e2fa13153 ;; \
      *) exit 1 ;; \
    esac; \
    curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
      "https://github.com/transifex/cli/releases/download/v1.6.17/tx-linux-${TARGETARCH}.tar.gz" -o /tmp/tx.tar.gz; \
    printf '%s  /tmp/tx.tar.gz\n' "$checksum" | sha256sum --check; \
    mkdir /out; tar -xzf /tmp/tx.tar.gz -C /out tx
FROM gcr.io/distroless/static-debian13:nonroot
COPY --from=download /out/tx /usr/local/bin/tx
COPY LICENSE /usr/share/doc/transifex-cli/LICENSE
WORKDIR /var/www
USER 65532:65532
ENTRYPOINT ["/usr/local/bin/tx"]
CMD ["--version"]
