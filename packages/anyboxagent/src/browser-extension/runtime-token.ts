const token = crypto.randomUUID()

export function getBrowserTrustedCommandToken() {
  return token
}

export function isBrowserTrustedCommandToken(value: string | undefined) {
  return Boolean(value && value === token)
}
