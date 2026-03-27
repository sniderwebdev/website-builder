# Deployment Guide

## Prerequisites

- Node.js 20+
- pnpm 9+
- A Cloudflare account (free tier works)
- Wrangler CLI: `pnpm add -g wrangler`

## Local Development (No Cloudflare Account Needed)

```bash
pnpm install
pnpm generate:css
pnpm dev
```

This starts all four services locally using Miniflare (Cloudflare Workers simulator):

| Service | URL |
|---|---|
| Storefront | http://localhost:5173 |
| Admin panel | http://localhost:5174 |
| Storefront API | http://localhost:8787 |
| Admin API | http://localhost:8788 |

## Going Live

### Step 1: Create a Cloudflare account

Go to https://cloudflare.com and sign up (free). No credit card required for Workers/D1/KV/R2 on the free plan.

### Step 2: Authenticate Wrangler

```bash
wrangler login
```

This opens a browser window. Log in with the client's Cloudflare account.

### Step 3: Provision and deploy

```bash
./scripts/setup-cloudflare.sh
```

This script will:
1. Create the D1 database and update `wrangler.toml`
2. Create the KV namespace and update `wrangler.toml`
3. Create the R2 bucket
4. Run D1 migrations (create all tables)
5. Deploy `workers/storefront-api`
6. Deploy `workers/admin-api`
7. Deploy `apps/storefront` to Cloudflare Pages
8. Deploy `apps/admin` to Cloudflare Pages

### Step 4: Set Worker secrets

```bash
# Storefront worker
wrangler secret put STRIPE_SECRET_KEY --name caramel-storefront-api
wrangler secret put STRIPE_WEBHOOK_SECRET --name caramel-storefront-api

# Admin worker
wrangler secret put JWT_SECRET --name caramel-admin-api
```

### Step 5: Create the first admin user

```bash
node --import tsx/esm scripts/create-admin-user.ts
```

(This script is added in Phase 4.)
