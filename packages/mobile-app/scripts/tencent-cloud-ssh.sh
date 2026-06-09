#!/usr/bin/env bash
set -euo pipefail

SSH_USER="ubuntu"
SSH_HOST="129.211.1.144"
SSH_PORT="22"
SSH_KEY="${HOME}/Downloads/Macmini.pem"

ssh \
  -i "$SSH_KEY" \
  -p "$SSH_PORT" \
  -o StrictHostKeyChecking=accept-new \
  "$SSH_USER@$SSH_HOST" \
  "$@"
