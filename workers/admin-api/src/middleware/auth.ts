import { verify } from 'hono/jwt'
import type { MiddlewareHandler } from 'hono'
import type { AdminContext, JwtPayload } from '../types'

export const requireAuth: MiddlewareHandler<AdminContext> = async (c, next) => {
  const authorization = c.req.header('Authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const token = authorization.slice(7)
  try {
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    c.set('user', payload as unknown as JwtPayload)
    await next()
  } catch {
    return c.json({ error: 'Unauthorized' }, 401)
  }
}
