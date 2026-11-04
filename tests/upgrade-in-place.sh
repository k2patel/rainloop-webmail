#!/bin/sh
set -eu
if [ "$#" -ne 1 ]; then
    echo 'Usage: sh tests/upgrade-in-place.sh /path/to/maintained-release.zip' >&2
    exit 1
fi
# Immutable archived source baseline, rather than the current maintained HEAD.
RL_UPGRADE_TEST_ROOT=$(mktemp -d)
trap 'rm -rf "$RL_UPGRADE_TEST_ROOT"' EXIT HUP INT TERM
mkdir "$RL_UPGRADE_TEST_ROOT/previous"
git archive 9bf8fa5b63d7e6871ee533126a7e1b1c85ee45b5 | tar -x -C "$RL_UPGRADE_TEST_ROOT/previous"
php tests/php/upgrade-layout.php "$RL_UPGRADE_TEST_ROOT/previous" "$1"
