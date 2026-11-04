#!/bin/sh
set -eu
yarn install --frozen-lockfile --ignore-scripts --non-interactive
yarn build:frontend
