import type { MiddlewareHandler } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import type { CartContext } from '../types'

export const session: MiddlewareHandler<CartContext> = async (c, next) => {
  let sessionId = getCookie(c, 'session_id')

  if (!sessionId) {
    sessionId = crypto.randomUUID()
    const secure = new URL(c.req.url).protocol === 'https:'
    setCookie(c, 'session_id', sessionId, {
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      secure,
    })
  }

  c.set('sessionId', sessionId)
  await next()
}
