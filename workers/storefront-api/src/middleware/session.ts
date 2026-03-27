import type { MiddlewareHandler } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import type { AppContext } from '../types'

export const session: MiddlewareHandler<AppContext> = async (c, next) => {
  let sessionId = getCookie(c, 'session_id')

  if (!sessionId) {
    sessionId = crypto.randomUUID()
    setCookie(c, 'session_id', sessionId, {
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    })
  }

  c.set('sessionId', sessionId)
  await next()
}
