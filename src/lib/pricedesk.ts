import type { Client, DeliveryMode, Order, OrderLine, PriceDeskRow, Product, Sku } from './types.ts'
import { priceForQty } from './pricing.ts'

export const ANY_ZONE = '*'

export const ZONES: { state: string; towns: string[] }[] = [
  { state: 'Perlis', towns: ['Kangar'] },
  { state: 'Selangor', towns: ['Shah Alam', 'Baling', 'Sungai Petani'] },
  { state: 'Penang', towns: ['Butterworth', 'Nibong Tebal'] },
  { state: 'Perak', towns: ['Pengkalan Hulu', 'Gerik', 'Ipoh', 'Sitiawan', 'Taiping'] },
]

export const MODE_LABEL: Record<DeliveryMode, string> = {
  any: 'Any mode',
  crane: 'Crane',
  no_crane: 'No crane',
  own_collection: 'Own collection',
  loose: 'Loose',
  shop_site: 'Shop & site',
  direct: 'Direct (factory)',
}

export const MODES = Object.keys(MODE_LABEL) as DeliveryMode[]

// Delivery modes a salesperson can pick on an order. "any" is only a wildcard on desk rows.
export const ORDER_MODES = MODES.filter((mode) => mode !== 'any')

const AREA_TO_ZONE: [string, string][] = [
  ['kangar', 'Kangar'],
  ['sungai petani', 'Sungai Petani'],
  ['baling', 'Baling'],
  ['alor setar', 'Shah Alam'],
  ['kuala kedah', 'Shah Alam'],
  ['jitra', 'Shah Alam'],
  ['anak bukit', 'Shah Alam'],
  ['pokok sena', 'Shah Alam'],
]

export function zoneForClient(client: Client | null): string {
  const area = client?.area.toLowerCase() ?? ''
  for (const [needle, zone] of AREA_TO_ZONE) {
    if (area.includes(needle)) return zone
  }
  return ANY_ZONE
}

export function zoneLabel(zone: string): string {
  return zone === ANY_ZONE ? 'All zones' : zone
}

export function todayISO(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export interface PriceKey {
  code: string
  zone: string
  mode: DeliveryMode
  qty: number
  date: string
}

export interface DeskHit {
  sell: number
  cost: number
  row: PriceDeskRow
}

export function tierQty(row: PriceDeskRow, product: Product | undefined, qty: number): number {
  if (row.tierUnit === 'pallet' && product?.palletQty) return qty / product.palletQty
  return qty
}

export function rowActive(row: PriceDeskRow, date: string): boolean {
  return row.effectiveFrom <= date && (row.effectiveTo === null || row.effectiveTo >= date)
}

// Match order: exact zone beats "all zones", exact mode beats "any mode", then the highest
// qty tier reached, then the most recent effective-from date.
export function lookupPrice(rows: PriceDeskRow[], products: Product[], key: PriceKey): DeskHit | null {
  const product = products.find((row) => row.code === key.code)
  let best: PriceDeskRow | null = null
  let bestRank: number[] = []
  for (const row of rows) {
    if (row.code !== key.code || !rowActive(row, key.date)) continue
    if (row.zone !== ANY_ZONE && row.zone !== key.zone) continue
    if (row.mode !== 'any' && row.mode !== key.mode) continue
    const reached = tierQty(row, product, key.qty)
    if (reached + 1e-9 < row.minQty) continue
    const rank = [
      row.zone === ANY_ZONE ? 0 : 1,
      row.mode === 'any' ? 0 : 1,
      row.tierUnit === 'pallet' ? row.minQty * (product?.palletQty ?? 1) : row.minQty,
      Number(row.effectiveFrom.replaceAll('-', '')),
    ]
    if (best === null || beats(rank, bestRank)) {
      best = row
      bestRank = rank
    }
  }
  return best ? { sell: best.sell, cost: best.cost, row: best } : null
}

function beats(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x > y
  }
  return false
}

export interface DeskContextData {
  products: Product[]
  priceRows: PriceDeskRow[]
}

export function orderKey(order: Pick<Order, 'zone' | 'deliveryMode'>, code: string, qty: number, date: string): PriceKey {
  return { code, zone: order.zone ?? ANY_ZONE, mode: order.deliveryMode ?? 'direct', qty, date }
}

export function deskHitForLine(
  order: Pick<Order, 'zone' | 'deliveryMode'>,
  sku: Sku,
  qty: number,
  desk: DeskContextData,
  date: string,
): DeskHit | null {
  return lookupPrice(desk.priceRows, desk.products, orderKey(order, sku.code, qty, date))
}

// Working price on an unlocked line: the Price Desk sell if there is a row, else the quick tier sheet.
export function draftSell(
  order: Pick<Order, 'zone' | 'deliveryMode'>,
  sku: Sku,
  qty: number,
  desk: DeskContextData,
  date = todayISO(),
): number {
  return deskHitForLine(order, sku, qty, desk, date)?.sell ?? priceForQty(sku.tiers, qty).price
}

export function isLocked(line: OrderLine): boolean {
  return line.lockDate !== undefined
}

export function clearLock(line: OrderLine): OrderLine {
  const { lockedSell: _s, lockedCost: _c, lockDate: _d, lockRowId: _r, lockSource: _src, ...rest } = line
  return rest
}

// Stamp today's sell + cost on every line that is not yet locked. Locked lines keep their values.
export function lockOrderLines(order: Order, skus: Sku[], desk: DeskContextData, date = todayISO()): Order {
  const lines = order.lines.map((line) => {
    if (isLocked(line)) return line
    const sku = skus.find((row) => row.id === line.skuId)
    if (!sku) return line
    const hit = deskHitForLine(order, sku, line.qty, desk, date)
    const sell = line.customPrice ? line.unitPrice : (hit?.sell ?? line.unitPrice)
    const lockSource: OrderLine['lockSource'] = line.customPrice ? 'typed' : hit ? 'desk' : 'tier'
    return {
      ...line,
      unitPrice: sell,
      lockedSell: sell,
      lockedCost: hit?.cost ?? null,
      lockDate: date,
      lockRowId: hit?.row.id ?? null,
      lockSource,
    }
  })
  return { ...order, lines }
}

export function repriceDrafts(orders: Order[], skus: Sku[], desk: DeskContextData, date = todayISO()): Order[] {
  return orders.map((order) => {
    if (order.stage !== 'new' && order.stage !== 'needs_approval') return order
    let changed = false
    const lines = order.lines.map((line) => {
      if (line.customPrice || isLocked(line)) return line
      const sku = skus.find((row) => row.id === line.skuId)
      if (!sku) return line
      const sell = draftSell(order, sku, line.qty, desk, date)
      if (sell === line.unitPrice) return line
      changed = true
      return { ...line, unitPrice: sell }
    })
    return changed ? { ...order, lines } : order
  })
}

export function lockedTotals(order: Order): { sell: number; cost: number; gp: number; complete: boolean } | null {
  if (order.lines.length === 0 || !order.lines.every(isLocked)) return null
  let sell = 0
  let cost = 0
  let complete = true
  for (const line of order.lines) {
    sell += line.qty * (line.lockedSell ?? line.unitPrice)
    if (line.lockedCost === null || line.lockedCost === undefined) complete = false
    else cost += line.qty * line.lockedCost
  }
  sell = Math.round(sell * 100) / 100
  cost = Math.round(cost * 100) / 100
  return { sell, cost, gp: Math.round((sell - cost) * 100) / 100, complete }
}
