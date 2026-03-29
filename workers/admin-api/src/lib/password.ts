// workers/admin-api/src/lib/password.ts

const toHex = (arr: Uint8Array): string =>
  Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')

const fromHex = (hex: string): Uint8Array =>
  new Uint8Array(hex.match(/.{2}/g)!.map(b => parseInt(b, 16)))

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    key,
    256
  )
  return `${toHex(salt)}:${toHex(new Uint8Array(bits))}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, storedHex] = stored.split(':')
  if (!saltHex || !storedHex) {
    return false
  }
  const salt = fromHex(saltHex)
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    key,
    256
  )
  return crypto.subtle.timingSafeEqual(bits, fromHex(storedHex).buffer as ArrayBuffer)
}
