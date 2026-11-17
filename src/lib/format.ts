import type { Unit } from './types.ts'

export function rm(value: number): string {
  const safe = Number.isFinite(value) ? value : 0
  return `RM ${safe.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function trimQty(value: number): string {
  if (!Number.isFinite(value)) return '0'
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

// Stock quantities: thousands separators, up to 2 decimals (4,800 · 12.5).
export function qty(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return value.toLocaleString('en-MY', { maximumFractionDigits: 2 })
}

export function unitWord(unit: Unit, qty: number): string {
  if (unit === 'pcs') return 'pcs'
  if (unit === 'bundle') return qty === 1 ? 'bundle' : 'bundles'
  if (unit === 'bag') return qty === 1 ? 'bag' : 'bags'
  return qty === 1 ? 'load' : 'loads'
}

export function whenLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-MY', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function isToday(iso: string): boolean {
  const date = new Date(iso)
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

export function isYesterday(iso: string): boolean {
  const date = new Date(iso)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  return (
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  )
}
