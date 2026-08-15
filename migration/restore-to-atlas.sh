#!/usr/bin/env bash
# THRETHA COUTURE — restore the migrated database into MongoDB Atlas.
#
# The archive (thretha_couture.archive.gz) already contains all products,
# categories, settings, the admin user, orders and customers, with every
# image URL already pointing at your Cloudinary account.
#
# Prerequisite: MongoDB Database Tools installed (provides `mongorestore`):
#   https://www.mongodb.com/try/download/database-tools
#
# Usage:
#   ./restore-to-atlas.sh "mongodb+srv://Admin:<url-encoded-pass>@threthacouture.fnfc3qo.mongodb.net/?retryWrites=true&w=majority"
#
# NOTE: if your password contains special characters, URL-encode them
#       (e.g. '@' -> '%40'). Your password 9037624696@Aj becomes 9037624696%40Aj.

set -euo pipefail

ATLAS_URI="${1:-}"
if [ -z "$ATLAS_URI" ]; then
  echo "Usage: $0 <ATLAS_CONNECTION_STRING>"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARCHIVE="$SCRIPT_DIR/thretha_couture.archive.gz"
TARGET_DB="${TARGET_DB_NAME:-thretha_couture}"

echo "Restoring $ARCHIVE  ->  Atlas DB '$TARGET_DB' ..."
mongorestore \
  --uri="$ATLAS_URI" \
  --gzip \
  --archive="$ARCHIVE" \
  --nsFrom='your_database_name.*' \
  --nsTo="$TARGET_DB.*" \
  --drop

echo "✅ Done. Verify in Atlas: database '$TARGET_DB' should contain products, categories, settings, users, orders, customers."
