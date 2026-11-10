# Compatible with BSD make and GNU make. Cargo owns Rust compilation.
CARGO = cargo
PREFIX = /usr/local
DESTDIR =
INSTALL = install
MANDOC = mandoc
MANDIR = $(PREFIX)/man
SYSCONFDIR = /etc/openmail

all: build

build:
	$(CARGO) build --locked --release

check: check-rust check-man

check-rust:
	$(CARGO) fmt --all -- --check
	$(CARGO) clippy --locked --all-targets -- -D warnings

check-man:
	$(MANDOC) -Tlint -Werror man/openmail.8 man/openmail.conf.5

test:
	$(CARGO) test --locked --all-targets

doc:
	$(CARGO) doc --locked --no-deps

# Stage the executable and examples. Never overwrite live system configuration.
install: build
	$(INSTALL) -d "$(DESTDIR)$(PREFIX)/bin"
	$(INSTALL) -m 755 target/release/openmail "$(DESTDIR)$(PREFIX)/bin/openmail"
	$(INSTALL) -d "$(DESTDIR)$(PREFIX)/share/examples/openmail"
	$(INSTALL) -m 644 etc/openmail.conf.example etc/relayd.conf.example etc/RELAYD.txt etc/RCCTL.txt etc/MAILDIR.txt "$(DESTDIR)$(PREFIX)/share/examples/openmail/"
	$(INSTALL) -m 555 etc/rc.d/openmail "$(DESTDIR)$(PREFIX)/share/examples/openmail/openmail.rc"
	$(INSTALL) -d "$(DESTDIR)$(MANDIR)/man8" "$(DESTDIR)$(MANDIR)/man5"
	$(INSTALL) -m 644 man/openmail.8 "$(DESTDIR)$(MANDIR)/man8/openmail.8"
	$(INSTALL) -m 644 man/openmail.conf.5 "$(DESTDIR)$(MANDIR)/man5/openmail.conf.5"

# Explicit opt-in for first installation. Preserve existing files and symlinks.
install-config:
	@test ! -e "$(DESTDIR)$(SYSCONFDIR)/config.toml" && test ! -L "$(DESTDIR)$(SYSCONFDIR)/config.toml" || { echo "configuration exists; leaving it unchanged" >&2; exit 1; }
	$(INSTALL) -d -m 750 "$(DESTDIR)$(SYSCONFDIR)"
	$(INSTALL) -m 640 etc/openmail.conf.example "$(DESTDIR)$(SYSCONFDIR)/config.toml"

clean:
	$(CARGO) clean

.PHONY: all build check check-rust check-man test doc install install-config clean
