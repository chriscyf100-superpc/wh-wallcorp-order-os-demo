export const DEFAULT_PASSWORD = 'wh demo'

export function deskPassword(): string {
  const fromEnv = import.meta.env.VITE_MANAGER_PASSWORD
  if (typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv.trim()
  return DEFAULT_PASSWORD
}

export function passwordMatches(input: string): boolean {
  return input.trim().toLowerCase() === deskPassword().toLowerCase()
}

export function usingDefaultPassword(): boolean {
  return deskPassword() === DEFAULT_PASSWORD
}
