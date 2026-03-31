# Admin User Seed Script

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a CLI script that hashes a password and inserts an admin user into the D1 database via `wrangler d1 execute`.

**Architecture:** A single `tsx`-executable TypeScript script at `scripts/setup-admin-user.ts`. It accepts `--email`, `--password`, `--role`, and `--local` flags, hashes the password using the same PBKDF2 algorithm as `workers/admin-api/src/lib/password.ts` (Web Crypto API, 100k iterations, SHA-256), then shells out to `wrangler d1 execute` to insert the user. No unit tests — the hash algorithm is already covered by `workers/admin-api/test/auth.test.ts`; verification is manual.

**Tech Stack:** Node.js 24 (Web Crypto API, `node:crypto` for UUID), `tsx` 4.21.0, `wrangler` CLI.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `scripts/setup-admin-user.ts` | **Create** | CLI script: parse args → hash password → run wrangler insert |
| `package.json` (root) | **Modify** | Add `db:seed-admin` script entry |

---

## Task 1: Create seed script and wire into package.json

**Files:**
- Create: `scripts/setup-admin-user.ts`
- Modify: `package.json` (root)

Note: This script has no unit tests. The PBKDF2 hashing is already validated in `workers/admin-api/test/auth.test.ts`. Correctness is verified by running the script locally against the dev D1 and confirming the user can log in via the API.

- [ ] **Step 1: Create `scripts/setup-admin-user.ts`**

```typescript
#!/usr/bin/env tsx
// scripts/setup-admin-user.ts

import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

// ─── Parse CLI args ───────────────────────────────────────────────────────────

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`)
  return idx === -1 ? undefined : process.argv[idx + 1]
}

const email    = getArg('email')
const password = getArg('password')
const role     = getArg('role') as 'owner' | 'editor' | undefined
const local    = process.argv.includes('--local')

if (!email || !password || !role) {
  console.error(
    'Usage: pnpm db:seed-admin --email <email> --password <password> --role <owner|editor> [--local]'
  )
  process.exit(1)
}

if (role !== 'owner' && role !== 'editor') {
  console.error('Error: --role must be "owner" or "editor"')
  process.exit(1)
}

// ─── PBKDF2 password hash (matches workers/admin-api/src/lib/password.ts) ────

const toHex = (arr: Uint8Array): string =>
  Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')

async function hashPassword(pwd: string): Promise<string> {
  const encoder = new TextEncoder()
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16))
  const key = await globalThis.crypto.subtle.importKey(
    'raw', encoder.encode(pwd), 'PBKDF2', false, ['deriveBits']
  )
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    key,
    256
  )
  return `${toHex(salt)}:${toHex(new Uint8Array(bits))}`
}

// ─── Insert ───────────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/'/g, "''")

const passwordHash = await hashPassword(password)
const id = randomUUID()
const createdAt = new Date().toISOString()

const sql = [
  `INSERT INTO admin_users (id, email, password_hash, role, created_at)`,
  `VALUES ('${esc(id)}', '${esc(email)}', '${esc(passwordHash)}', '${esc(role)}', '${esc(createdAt)}')`,
].join(' ')

const localFlag = local ? ' --local' : ''
const cmd = `wrangler d1 execute caramel-db --command "${sql}"${localFlag}`

console.log(`Creating admin user: ${email} (${role})...`)
try {
  execSync(cmd, { stdio: 'inherit', cwd: 'workers/admin-api' })
  console.log(`✓ Admin user created: ${email}`)
} catch {
  console.error('Failed to create admin user. Check that the DB is initialised and wrangler is authenticated.')
  process.exit(1)
}
```

- [ ] **Step 2: Add `db:seed-admin` to root `package.json`**

In `package.json` (root), add one line to the `scripts` object:

```json
"db:seed-admin": "tsx scripts/setup-admin-user.ts"
```

The full `scripts` block should look like:

```json
"scripts": {
  "dev": "turbo dev",
  "build": "turbo build",
  "test": "turbo test",
  "lint": "turbo lint",
  "typecheck": "turbo typecheck",
  "generate:css": "tsx scripts/generate-css-vars.ts",
  "db:seed-admin": "tsx scripts/setup-admin-user.ts"
}
```

- [ ] **Step 3: Verify the script runs (error path)**

Run it without args to confirm the usage message:

```bash
cd "/Users/lukesnider/Development/Caramel Website" && pnpm db:seed-admin
```

Expected output:
```
Usage: pnpm db:seed-admin --email <email> --password <password> --role <owner|editor> [--local]
```
Expected exit code: 1 (non-zero — this is correct).

- [ ] **Step 4: Commit**

```bash
git add scripts/setup-admin-user.ts package.json
git commit -m "feat(scripts): add db:seed-admin script to create admin users in D1"
```

---

## Verification

To create a real admin user against the local dev D1:

```bash
# Start the admin-api dev server first (needed to init local D1 schema)
# Terminal 1:
cd workers/admin-api && pnpm dev

# Terminal 2 — seed the user:
pnpm db:seed-admin --email admin@example.com --password mypassword --role owner --local

# Terminal 3 — test login:
curl -s -X POST http://localhost:8788/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"mypassword"}' | jq .
```

Expected: `{ "token": "...", "user": { "id": "...", "email": "admin@example.com", "role": "owner" } }`

Note: The local D1 is only initialised after `wrangler dev` has run the migrations at least once. If the `admin_users` table doesn't exist yet, run `wrangler d1 migrations apply caramel-db --local` from `workers/admin-api/` first.
