#!make

rebuild: _down
	docker compose build --no-cache

up: _up status
_up:
	docker compose up -d

stop: _stop status
_stop:
	docker compose stop

down: _down status
_down:
	docker compose down

restart: _stop _up status

status:
	@docker compose ps

tx:
	@docker compose run --no-deps --rm tx pull -a -s -f -d

console-node:
	@docker compose run --no-deps --rm node sh
console-tx:
	@docker compose run --no-deps --rm tx --help
console-php:
	@docker compose exec php /usr/local/bin/php -a
console: console-node

logs:
	@docker compose logs --tail=100 -f
logs-db:
	@docker compose logs --tail=100 -f db
logs-php:
	@docker compose logs --tail=100 -f php
logs-node:
	@docker compose logs --tail=100 -f node
logs-nginx:
	@docker compose logs --tail=100 -f nginx
logs-mail:
	@docker compose logs --tail=100 -f mail
logs-tx:
	@docker compose logs --tail=100 -f tx

rl-lint:
	@docker compose run --no-deps --rm node yarn lint
rl-dev:
	@docker compose run --no-deps --rm node npm run watch-js
rl-compile:
	@docker compose run --no-deps --rm node yarn build:frontend
rl-compile-with-source:
	@docker compose run --no-deps --rm node yarn build:frontend
rl-watch-css:
	@docker compose run --no-deps --rm node npm run watch-css
rl-watch-js:
	@docker compose run --no-deps --rm node npm run watch-js

rl-build:
	@docker compose run --no-deps --rm node yarn build

yarn-install:
	@docker compose run --no-deps --rm node yarn install --frozen-lockfile --ignore-scripts
yarn-outdated:
	@docker compose run --no-deps --rm node yarn outdated
yarn-upgrade:
	@docker compose run --no-deps --rm node yarn upgrade-interactive --exact --latest

# Signing uses the maintainer's configured local GPG environment.
gpg:
	@echo "Sign reviewed release artifacts with your own local GPG key."
