import type { PriceDeskRow } from './types.ts'

export function monthEnd(month: string, offset = 0) {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m + offset, 0)).toISOString().slice(0, 10)
}
// Match the exact product, destination, delivery mode and quantity break across dates.
export function priceComparison(rows: PriceDeskRow[], date: string, baseline: string) {
  const snapshot = (day: string) => {
    const map = new Map<string, PriceDeskRow>()
    for (const row of rows
      .filter((r) => r.effectiveFrom <= day && (!r.effectiveTo || r.effectiveTo >= day))
      .toSorted((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))) {
      map.set(JSON.stringify([row.code, row.zone, row.mode, row.tierUnit, row.minQty]), row)
    }
    return map
  }
  const current = snapshot(date),
    previous = snapshot(baseline)
  return [...current.entries()].flatMap(([key, row]) => {
    const before = previous.get(key)
    return before && before.sell > 0
      ? [{ ...row, before: before.sell, delta: row.sell - before.sell, pct: (row.sell / before.sell - 1) * 100 }]
      : []
  })
}
