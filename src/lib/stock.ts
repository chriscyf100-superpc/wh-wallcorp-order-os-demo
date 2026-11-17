import type { Sku, StockSignal } from './types.ts'

// Reads the yard's WhatsApp ("Y12 没货, pasir tinggal sikit, red brick dah masuk") into signal changes.
const OUT = /没货|没有了|卖完|habis|tiada|kosong|\bout\b|no stock|sold out|finish(?:ed)?/i
const LOW = /少|不多|快没|sikit|sedikit|tinggal|hampir|\blow\b|thin|running low/i
const ENOUGH = /有货|到货|进货|\bada\b|enough|\bok\b|full|banyak|restock(?:ed)?|dah masuk|sampai|arrived|in stock/i

export interface YardRead {
  sku: Sku
  to: StockSignal
  text: string
}

export function readYardNote(text: string, skus: Sku[]): YardRead[] {
  const reads = new Map<string, YardRead>()
  for (const raw of text.split(/\n|[,，;；。]+/)) {
    const part = raw.trim()
    if (!part) continue
    const lower = part.toLowerCase()
    const hits = skus.filter((sku) => [sku.name, sku.code, sku.nameZh, ...sku.aliases].some((alias) => alias.trim().length >= 2 && lower.includes(alias.toLowerCase())))
    if (hits.length === 0) continue
    // Check "out" before "low" before "enough": 没货 also contains 货.
    const to: StockSignal | null = OUT.test(part) ? 'out' : LOW.test(part) ? 'low' : ENOUGH.test(part) ? 'enough' : null
    if (!to) continue
    for (const sku of hits) reads.set(sku.id, { sku, to, text: part })
  }
  return [...reads.values()]
}
