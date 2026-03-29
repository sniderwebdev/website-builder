import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import { getAdminUser, updateLastLogin } from '@commerce/db'
import { verifyPassword } from '../lib/password'
import type { AdminContext } from '../types'

const auth = new Hono<AdminContext>()

auth.post('/login', async (c) => {
  let body: { email?: string; password?: string }
  try {
    body = await c.req.json<{ email?: string; password?: string }>()
  } catch {
    return c.json({ error: 'Invalid request body' }, 400)
  }

  const { email, password } = body
  if (!email || !password) {
    return c.json({ error: 'email and password are required' }, 400)
  }

  const user = await getAdminUser(c.env.DB, email)
  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  await updateLastLogin(c.env.DB, user.id)

  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 // 24 hours
  const token = await sign(
    { sub: user.id, email: user.email, role: user.role, exp },
    c.env.JWT_SECRET
  )

  return c.json({ token, user: { id: user.id, email: user.email, role: user.role } })
})

export default auth
