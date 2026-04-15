#!/bin/bash
# Wrapper SSH pour git — lit SSH_PRIVATE_KEY depuis les secrets Replit
KEY_FILE=$(mktemp /tmp/ssh_key_XXXXXX)
node -e "
const raw = process.env.SSH_PRIVATE_KEY || '';
const begin = '-----BEGIN OPENSSH PRIVATE KEY-----';
const end = '-----END OPENSSH PRIVATE KEY-----';
const body = raw.replace(begin,'').replace(end,'').replace(/[\s\r\n]/g,'');
const lines = [];
for (let i = 0; i < body.length; i += 64) lines.push(body.slice(i, i+64));
const fs = require('fs');
fs.writeFileSync(process.argv[1], [begin, ...lines, end, ''].join('\n'), {mode: 0o600});
" "$KEY_FILE"
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "$@"
rm -f "$KEY_FILE"
