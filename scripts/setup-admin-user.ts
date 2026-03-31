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

// ─── Main ──────────────────────────────────────────────────────────────────────

;(async () => {
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
})()
