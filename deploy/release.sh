#!/usr/bin/env bash
set -euo pipefail
umask 077
root="$HOME/novrevents"
export NOVREVENTS_CONFIG_DIR="$root/config"
if [[ ! "${SSH_ORIGINAL_COMMAND:-}" =~ ^release\ ([0-9a-f]{40})$ ]]; then exit 64; fi
sha="${BASH_REMATCH[1]}"
exec 9>"$root/release.lock"
flock -w 300 9
install -d "$root/releases" "$root/backups"
tmp=$(mktemp -d "$root/releases/.incoming.XXXXXXXX")
trap 'rm -rf -- "$tmp"' EXIT
mirror="$root/source.git"
IFS= read -r token
test -n "$token"
if [[ ! -d "$mirror" ]]; then git init --bare "$mirror" >/dev/null; fi
header=$(printf 'x-access-token:%s' "$token" | base64 -w0)
unset token
GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.https://github.com/.extraheader GIT_CONFIG_VALUE_0="Authorization: Basic $header" git --git-dir="$mirror" fetch --no-tags https://github.com/novrGitLab/novrevents.git +refs/heads/main:refs/heads/main
unset header
test "$(git --git-dir="$mirror" rev-parse refs/heads/main)" = "$sha"
git --git-dir="$mirror" archive --format=tar.gz "$sha" deploy novrevents-backend novrevents-frontend >"$tmp/source.tgz"
tar --extract --gzip --file="$tmp/source.tgz" --no-same-owner --directory="$tmp"
release="$root/releases/$sha"
if [[ ! -d "$release" ]]; then
    mkdir "$release"
    cp -a "$tmp"/{deploy,novrevents-backend,novrevents-frontend} "$release/"
fi
export RELEASE_SHA="$sha"
compose=(docker compose -f "$release/deploy/compose.yml")
"${compose[@]}" build --pull
"${compose[@]}" up -d --wait database
test -f "$NOVREVENTS_CONFIG_DIR/restore-verified"
"${compose[@]}" exec -T database sh -ec 'pg_dump --no-owner --no-acl -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' >"$tmp/database.dump"
"${compose[@]}" exec -T database pg_restore --list <"$tmp/database.dump" >/dev/null
install -m 600 "$tmp/database.dump" "$root/backups/$(date -u +%Y%m%dT%H%M%SZ)-$sha.dump"
"${compose[@]}" run --rm --no-deps events-api npm run db:deploy
prior=$(readlink -f "$root/current" || true)
if ! "${compose[@]}" up -d --wait --wait-timeout 200 events-api events-web; then
    if [[ -f "$prior/deploy/compose.yml" ]]; then
        RELEASE_SHA=$(basename "$prior") docker compose -f "$prior/deploy/compose.yml" up -d --no-build --wait events-api events-web
    fi
    exit 1
fi
ln -sfn "$release" "$tmp/active"
mv -Tf "$tmp/active" "$root/current"
