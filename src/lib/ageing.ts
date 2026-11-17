import type { Ageing } from './types.ts'

// Ageing buckets for charts: current = neutral grey, then 30 → 60 → 90 days one warm hue getting darker
// (ordinal ramp, passes the dataviz validator). See components/meters.tsx.
export const AGE_ORDER: Ageing[] = ['ok', '30', '60', '90']
export const AGE_COLOR: Record<Ageing, string> = { ok: '#b8c2cf', '30': '#e9a06b', '60': '#c8611f', '90': '#8a3410' }
export const AGE_SHORT: Record<Ageing, string> = { ok: 'Current', '30': '30 days', '60': '60 days', '90': '90+ days' }
