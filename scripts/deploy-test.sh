#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--help" ]]; then
  echo 'Usage: npm run deploy:test [-- --check]'
  echo 'Defaults: AURAL_DEPLOY_HOST=cd AURAL_DEPLOY_DIR=/home/deploy/aural-test AURAL_HTTP_PORT=13001 AURAL_DEPLOY_ENV=.env.test.local'
  exit 0
fi
[[ $# == 0 || ( $# == 1 && "$1" == "--check" ) ]] || { echo 'Unknown argument; use --help' >&2; exit 1; }
cd "$(dirname "$0")/.."
for tool in git python3 ssh scp docker gzip; do command -v "$tool" >/dev/null || { echo "Missing $tool" >&2; exit 1; }; done
host=${AURAL_DEPLOY_HOST:-cd}
remote_dir=${AURAL_DEPLOY_DIR:-/home/deploy/aural-test}
port=${AURAL_HTTP_PORT:-13001}
env_file=${AURAL_DEPLOY_ENV:-.env.test.local}
[[ "$host" =~ ^[a-zA-Z0-9][a-zA-Z0-9@._-]*$ && "$remote_dir" =~ ^/[a-zA-Z0-9/_-]+$ && "$port" =~ ^[0-9]+$ ]] || { echo 'Invalid deployment host, directory or port' >&2; exit 1; }
((port > 1024 && port < 65536)) || { echo 'Port must be 1025-65535' >&2; exit 1; }
[[ -f "$env_file" ]] || { echo "Missing $env_file. Copy deploy/test/env.example and fill test settings first." >&2; exit 1; }
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
# Validate settings before uploading. Never print credential values.
python3 scripts/deploy-test-config.py "$env_file" "$work/app.env"
ssh_opts=(-o BatchMode=yes -o ConnectTimeout=10)
ssh "${ssh_opts[@]}" "$host" 'command -v docker >/dev/null && command -v flock >/dev/null && docker compose version && docker info --format "Docker server: {{.ServerVersion}}"'
if [[ "${1:-}" == '--check' ]]; then
  echo 'Configuration and SSH/Docker checks passed. No deployment performed.'
  exit 0
fi
release="$(date -u +%Y%m%dT%H%M%SZ)-$(git rev-parse --short HEAD)-${RANDOM}"
# Ship the current worktree, including non-ignored additions. Omit secrets and Git metadata.
python3 - "$work/source.tar.gz" <<'PY'
import pathlib, subprocess, sys, tarfile
paths = subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z']).decode().split('\0')
with tarfile.open(sys.argv[1], 'w:gz') as out:
    for name in sorted(set(filter(None, paths))):
        p = pathlib.Path(name)
        if any(part.startswith('.env') for part in p.parts) or p.suffix == '.pem': continue
        if p.is_symlink(): raise SystemExit('Symlinks are not accepted in deployment archives: '+name)
        if p.is_file(): out.add(p, arcname=name, recursive=False)
PY
# Compile locally to avoid exhausting memory on the shared test server.
docker build --platform linux/amd64 --secret "id=app_env,src=$work/app.env" -f deploy/test/Dockerfile -t "aural-test:$release" .
docker save "aural-test:$release" | gzip > "$work/image.tar.gz"
ssh "${ssh_opts[@]}" "$host" "umask 077; mkdir -p '$remote_dir/releases/$release'"
scp "${ssh_opts[@]}" "$work/source.tar.gz" "$work/app.env" "$work/image.tar.gz" "$host:$remote_dir/releases/$release/"
ssh "${ssh_opts[@]}" "$host" bash -s -- "$remote_dir" "$release" "$port" < scripts/deploy-test-remote.sh
echo "Deployment complete. Remote gateway: 127.0.0.1:$port; configure HTTPS using deploy/test/README.md."
