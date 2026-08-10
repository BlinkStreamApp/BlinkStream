let authBroken = false

export function isAuthBroken() {
  return authBroken
}

export function markAuthBroken() {
  authBroken = true
}

export function clearAuthBrokenFlag() {
  authBroken = false
}
