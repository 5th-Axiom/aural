#!/usr/bin/env bash
set -euo pipefail
root=$1
release=$2
port=$3
exec 9>"$root/deploy.lock"
flock -n 9 || { echo 'Another Aural deployment is running' >&2; exit 1; }
next="$root/releases/$release"
previous=$(readlink -f "$root/current" 2>/dev/null || true)
cd "$next"
mkdir source
tar -xzf source.tar.gz -C source
cp source/deploy/test/compose.yaml source/deploy/test/nginx.conf .
chmod 600 app.env
printf 'AURAL_IMAGE=aural-test:%s\nAURAL_HTTP_PORT=%s\n' "$release" "$port" > compose.env
compose() { docker compose -p aural-test --env-file "$1/compose.env" -f "$1/compose.yaml" "${@:2}"; }
# Image was built locally; loading does not run a compiler on this shared server.
gzip -dc image.tar.gz | docker load

if ! compose "$next" up -d --wait --wait-timeout 180; then
  echo 'New release failed health checks.' >&2
  if [[ -n "$previous" && -f "$previous/compose.yaml" ]]; then
    echo 'Restoring previous release...'
    compose "$previous" up -d --wait --wait-timeout 180 || { echo 'Rollback failed; inspect docker compose status.' >&2; exit 1; }
  else
    compose "$next" down
  fi
  exit 1
fi
ln -sfn "$next" "$root/current.next"
mv -Tf "$root/current.next" "$root/current"
echo "Healthy release: $release"
compose "$next" ps
