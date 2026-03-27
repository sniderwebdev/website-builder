#!/usr/bin/env bash
set -e

# Read brand name from config
BRAND_NAME=$(cd "$(dirname "$0")/.." && node -e "
const { execSync } = require('child_process');
const result = execSync('tsx -e \"import b from \'./brand.config.ts\'; console.log(b.name.toLowerCase().replace(/\\s+/g, \'-\'))\"', { encoding: 'utf8' });
console.log(result.trim());
" 2>/dev/null || echo "caramel")

echo "🚀 Setting up Cloudflare resources for: $BRAND_NAME"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# 1. Create D1 database
echo "Creating D1 database..."
DB_JSON=$(wrangler d1 create "${BRAND_NAME}-db" --json 2>/dev/null || echo '{}')
DB_ID=$(echo "$DB_JSON" | node -e "let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{ try { console.log(JSON.parse(d).uuid || JSON.parse(d).id || 'PLACEHOLDER'); } catch(e) { console.log('PLACEHOLDER'); } })" 2>/dev/null || echo "PLACEHOLDER")
sed -i '' "s/PLACEHOLDER_D1_ID/$DB_ID/g" "$ROOT_DIR/workers/storefront-api/wrangler.toml"
sed -i '' "s/PLACEHOLDER_D1_ID/$DB_ID/g" "$ROOT_DIR/workers/admin-api/wrangler.toml"
echo "✓ D1 database: $DB_ID"

# 2. Create KV namespace
echo "Creating KV namespace..."
KV_JSON=$(wrangler kv namespace create "${BRAND_NAME}-cache" --json 2>/dev/null || echo '{}')
KV_ID=$(echo "$KV_JSON" | node -e "let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{ try { console.log(JSON.parse(d).id || 'PLACEHOLDER'); } catch(e) { console.log('PLACEHOLDER'); } })" 2>/dev/null || echo "PLACEHOLDER")
sed -i '' "s/PLACEHOLDER_KV_ID/$KV_ID/g" "$ROOT_DIR/workers/storefront-api/wrangler.toml"
sed -i '' "s/PLACEHOLDER_KV_ID/$KV_ID/g" "$ROOT_DIR/workers/admin-api/wrangler.toml"
echo "✓ KV namespace: $KV_ID"

# 3. Create R2 bucket
echo "Creating R2 bucket..."
wrangler r2 bucket create "${BRAND_NAME}-assets" || true
echo "✓ R2 bucket: ${BRAND_NAME}-assets"

# 4. Run D1 migrations
echo "Running database migrations..."
wrangler d1 execute "${BRAND_NAME}-db" --file="$ROOT_DIR/packages/db/src/migrations/0001_initial.sql" --remote
echo "✓ Migrations complete"

# 5. Deploy workers
echo "Deploying storefront-api..."
(cd "$ROOT_DIR/workers/storefront-api" && wrangler deploy)

echo "Deploying admin-api..."
(cd "$ROOT_DIR/workers/admin-api" && wrangler deploy)

# 6. Deploy Pages apps
echo "Building and deploying storefront..."
(cd "$ROOT_DIR/apps/storefront" && pnpm build && wrangler pages deploy dist --project-name="${BRAND_NAME}-storefront")

echo "Building and deploying admin..."
(cd "$ROOT_DIR/apps/admin" && pnpm build && wrangler pages deploy dist --project-name="${BRAND_NAME}-admin")

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "  1. wrangler secret put STRIPE_SECRET_KEY --name ${BRAND_NAME}-storefront-api"
echo "  2. wrangler secret put JWT_SECRET --name ${BRAND_NAME}-admin-api"
echo "  3. node --import tsx/esm scripts/create-admin-user.ts"
