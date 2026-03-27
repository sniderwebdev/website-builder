import type { D1Database } from '@cloudflare/workers-types'

export type AdminRole = 'owner' | 'editor'

export interface AdminUser {
  id: string
  email: string
  passwordHash: string
  role: AdminRole
  createdAt: string
  lastLoginAt?: string
}

function rowToAdminUser(row: Record<string, unknown>): AdminUser {
  return {
    id: row['id'] as string,
    email: row['email'] as string,
    passwordHash: row['password_hash'] as string,
    role: row['role'] as AdminRole,
    createdAt: row['created_at'] as string,
    ...(row['last_login_at'] != null ? { lastLoginAt: row['last_login_at'] as string } : {}),
  }
}

export async function getAdminUser(
  db: D1Database,
  email: string
): Promise<AdminUser | null> {
  const row = await db
    .prepare('SELECT * FROM admin_users WHERE email = ?')
    .bind(email)
    .first()
  return row ? rowToAdminUser(row as Record<string, unknown>) : null
}

export async function createAdminUser(
  db: D1Database,
  input: { email: string; passwordHash: string; role: AdminRole }
): Promise<AdminUser> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO admin_users (id, email, password_hash, role, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(id, input.email, input.passwordHash, input.role, now)
    .run()
  const user = await getAdminUser(db, input.email)
  if (!user) throw new Error(`Failed to create admin user: ${input.email}`)
  return user
}

export async function updateLastLogin(db: D1Database, id: string): Promise<void> {
  await db
    .prepare('UPDATE admin_users SET last_login_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), id)
    .run()
}
