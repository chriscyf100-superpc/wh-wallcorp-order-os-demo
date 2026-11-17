import { EMAS_PRODUCTS } from './catalog.ts'
import type { DeskData, MoveKind, Order, Product, PurchaseOrder, Sku, StockCount, StockItem, StockMove, StockSignal } from './types.ts'
import { uid } from './utils.ts'

/*
 * Counted inventory for the Shah Alam yard — the ERP-style layer under the 有货 / 少 / 没货 signal.
 *
 *  - An item is "stocked" when it has a StockItem. Codes are the Price Desk product codes (EMAS master).
 *    Factory-direct lines (Monier tiles, RC pipes) are simply not stocked and never move here.
 *  - Reserved   = open orders (Confirmed + Preparing) for the item.
 *    Available  = on hand − reserved.   On order = sent / part-received purchase orders.
 *  - Delivering an order issues its stocked lines. Receiving a PO adds stock and moves the average cost.
 *    A stock count posts the difference as an adjustment. Every change is a StockMove (the ledger).
 *  - The sales-facing signal is worked out: available ≤ 0 → 没货, ≤ re-order level → 少, else 有货.
 */

export const YARD = 'Shah Alam yard'

const r2 = (value: number) => Math.round(value * 100) / 100

export const STALE_DAYS = 30

export function isStale(lastCountAt: string | null, now = Date.now()): boolean {
  return !lastCountAt || now - new Date(lastCountAt).getTime() > STALE_DAYS * 86_400_000
}

export function signalOf(available: number, reorderAt: number): StockSignal {
  if (available <= 0) return 'out'
  if (available <= reorderAt) return 'low'
  return 'enough'
}

export function reservedByCode(orders: Order[], skus: Sku[]): Map<string, { qty: number; orders: string[] }> {
  const codeOf = new Map(skus.map((sku) => [sku.id, sku.code]))
  const out = new Map<string, { qty: number; orders: string[] }>()
  for (const order of orders) {
    if (order.stage !== 'confirmed' && order.stage !== 'preparing') continue
    for (const line of order.lines) {
      const code = codeOf.get(line.skuId)
      if (!code) continue
      const row = out.get(code) ?? { qty: 0, orders: [] }
      row.qty += line.qty
      if (!row.orders.includes(order.id)) row.orders.push(order.id)
      out.set(code, row)
    }
  }
  return out
}

export function onOrderByCode(pos: PurchaseOrder[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const po of pos) {
    if (po.status !== 'sent' && po.status !== 'partial') continue
    for (const line of po.lines) out.set(line.code, (out.get(line.code) ?? 0) + Math.max(0, line.qty - line.received))
  }
  return out
}

export interface StockRow {
  item: StockItem
  product: Product | undefined
  reserved: number
  reservedOrders: string[]
  available: number
  onOrder: number
  signal: StockSignal
  value: number
  needsRestock: boolean
  suggestQty: number
}

export function stockRows(data: Pick<DeskData, 'stockItems' | 'orders' | 'skus' | 'purchaseOrders'>, products: Product[]): StockRow[] {
  const reserved = reservedByCode(data.orders, data.skus)
  const onOrder = onOrderByCode(data.purchaseOrders)
  const byCode = new Map(products.map((p) => [p.code, p]))
  return data.stockItems.map((item) => {
    const r = reserved.get(item.code)
    const available = r2(item.onHand - (r?.qty ?? 0))
    const coming = onOrder.get(item.code) ?? 0
    const projected = available + coming
    const needsRestock = projected <= item.reorderAt
    const suggestQty = needsRestock ? Math.max(item.reorderQty, Math.ceil(item.reorderAt * 2 - projected)) : 0
    return {
      item,
      product: byCode.get(item.code),
      reserved: r?.qty ?? 0,
      reservedOrders: r?.orders ?? [],
      available,
      onOrder: coming,
      signal: signalOf(available, item.reorderAt),
      value: r2(Math.max(0, item.onHand) * item.avgCost),
      needsRestock,
      suggestQty,
    }
  })
}

// Keep the old per-SKU signal (used by Confirm, the board and the dashboard) in step with the counts.
export function syncSignals(data: DeskData, at = new Date().toISOString()): DeskData {
  const items = new Map(data.stockItems.map((item) => [item.code, item]))
  const reserved = reservedByCode(data.orders, data.skus)
  let changed = false
  const skus = data.skus.map((sku) => {
    const item = items.get(sku.code)
    if (!item) return sku
    const signal = signalOf(item.onHand - (reserved.get(sku.code)?.qty ?? 0), item.reorderAt)
    if (signal === sku.stock) return sku
    changed = true
    return { ...sku, stock: signal, stockAt: at }
  })
  return changed ? { ...data, skus } : data
}

// Post signed quantities against items; every one leaves a ledger line with the running balance.
export function postMoves(
  data: DeskData,
  moves: { code: string; qty: number; kind: MoveKind; ref: string; note?: string; cost?: number; setTo?: number }[],
  by: string,
  at = new Date().toISOString(),
): DeskData {
  if (moves.length === 0) return data
  const items = new Map(data.stockItems.map((item) => [item.code, { ...item }]))
  const ledger: StockMove[] = []
  for (const move of moves) {
    const item = items.get(move.code)
    if (!item) continue
    const qty = move.setTo !== undefined ? r2(move.setTo - item.onHand) : move.qty
    if (qty === 0 && move.kind !== 'count') continue
    if (move.kind === 'receive' && move.cost !== undefined && qty > 0) {
      const base = Math.max(0, item.onHand)
      item.avgCost = r2((base * item.avgCost + qty * move.cost) / (base + qty))
    }
    item.onHand = r2(item.onHand + qty)
    if (move.kind === 'count') {
      item.lastCountAt = at
      item.checkFlag = null
    }
    items.set(item.code, item)
    ledger.push({ id: uid('mv'), at, code: move.code, kind: move.kind, qty, balance: item.onHand, ref: move.ref, by, note: move.note ?? '' })
  }
  const next = { ...data, stockItems: data.stockItems.map((item) => items.get(item.code) ?? item), stockMoves: [...ledger.reverse(), ...data.stockMoves].slice(0, 1500) }
  return syncSignals(next, at)
}

// An order reaching Delivered takes its stocked lines out of the yard (factory-direct items are not stocked).
export function issueForDelivery(data: DeskData, order: Order, at = new Date().toISOString()): DeskData {
  const stocked = new Set(data.stockItems.map((item) => item.code))
  const moves = order.lines
    .map((line) => ({ line, sku: data.skus.find((sku) => sku.id === line.skuId) }))
    .filter(({ sku }) => sku && stocked.has(sku.code))
    .map(({ line, sku }) => ({ code: sku?.code ?? '', qty: -line.qty, kind: 'issue' as const, ref: order.doNumber ?? order.id, note: `Delivered ${order.id}` }))
  return postMoves(data, moves, 'Delivery', at)
}

/* ---------- purchase orders ---------- */

export function draftPurchaseOrders(data: DeskData, lines: { code: string; qty: number }[], at = new Date().toISOString()): { data: DeskData; created: PurchaseOrder[] } {
  const bySupplier = new Map<string, PurchaseOrder['lines']>()
  const items = new Map(data.stockItems.map((item) => [item.code, item]))
  for (const line of lines) {
    const item = items.get(line.code)
    if (!item || line.qty <= 0) continue
    const list = bySupplier.get(item.supplier) ?? []
    list.push({ code: line.code, qty: line.qty, received: 0, cost: item.avgCost })
    bySupplier.set(item.supplier, list)
  }
  let n = data.purchaseOrders.length
  const created = [...bySupplier.entries()].map(([supplier, poLines]) => {
    n += 1
    const lead = Math.max(...poLines.map((l) => items.get(l.code)?.leadDays ?? 3))
    return {
      id: `PO-${String(2600 + n).padStart(4, '0')}`,
      supplier,
      createdAt: at,
      expected: addDays(at.slice(0, 10), lead),
      status: 'draft' as const,
      lines: poLines,
      note: '',
    }
  })
  return { data: { ...data, purchaseOrders: [...created, ...data.purchaseOrders] }, created }
}

export function receivePurchase(data: DeskData, poId: string, got: Record<string, number>, at = new Date().toISOString()): DeskData {
  const po = data.purchaseOrders.find((row) => row.id === poId)
  if (!po) return data
  const lines = po.lines.map((line) => ({ ...line, received: r2(line.received + Math.max(0, got[line.code] ?? 0)) }))
  const done = lines.every((line) => line.received >= line.qty)
  const nextPo: PurchaseOrder = { ...po, lines, status: done ? 'received' : 'partial' }
  const base = { ...data, purchaseOrders: data.purchaseOrders.map((row) => (row.id === poId ? nextPo : row)) }
  return postMoves(
    base,
    po.lines.filter((line) => (got[line.code] ?? 0) > 0).map((line) => ({ code: line.code, qty: got[line.code] ?? 0, kind: 'receive' as const, ref: po.id, cost: line.cost, note: `GRN from ${po.supplier}` })),
    'Yard (goods in)',
    at,
  )
}

/* ---------- stock counts ---------- */

export function startCount(data: DeskData, codes: string[], name: string, at = new Date().toISOString()): { data: DeskData; count: StockCount } {
  const items = new Map(data.stockItems.map((item) => [item.code, item]))
  const count: StockCount = {
    id: uid('cnt'),
    name,
    startedAt: at,
    postedAt: null,
    lines: codes.filter((code) => items.has(code)).map((code) => ({ code, system: items.get(code)?.onHand ?? 0, counted: null })),
  }
  return { data: { ...data, stockCounts: [count, ...data.stockCounts] }, count }
}

// Post a count: on hand becomes what was counted, plus anything that moved since the count started.
export function postCount(data: DeskData, countId: string, at = new Date().toISOString()): DeskData {
  const count = data.stockCounts.find((row) => row.id === countId)
  if (!count || count.postedAt) return data
  const items = new Map(data.stockItems.map((item) => [item.code, item]))
  const moves = count.lines
    .filter((line) => line.counted !== null)
    .map((line) => {
      const since = (items.get(line.code)?.onHand ?? line.system) - line.system
      return { code: line.code, qty: 0, setTo: r2((line.counted ?? 0) + since), kind: 'count' as const, ref: count.name, note: `Counted ${line.counted}, system ${line.system}` }
    })
  const base = { ...data, stockCounts: data.stockCounts.map((row) => (row.id === countId ? { ...row, postedAt: at } : row)) }
  return postMoves(base, moves, 'Stock count', at)
}

/* ---------- the yard's WhatsApp, with numbers ---------- */

const OUT = /没货|没有了|卖完|habis|tiada|kosong|\bout\b|no stock|sold out|finish(?:ed)?/i
const LOW = /少|不多|快没|sikit|sedikit|hampir|\blow\b|thin|running low/i
const IN = /到货|进货|进了|到了|masuk|sampai|arrived|received|terima|\bin\b|lorry|lori|restock/i
const LEFT = /剩|还有|tinggal|baki|balance|\bleft\b|count|kira|ada|有/i

export interface YardStockRead {
  code: string
  name: string
  // count = set on hand; receive = add; check = yard and system disagree, put it on the next count
  action: 'count' | 'receive' | 'check'
  qty: number | null
  text: string
}

export function readYardStock(text: string, skus: Sku[], items: StockItem[], products: Product[]): YardStockRead[] {
  const stocked = new Map(items.map((item) => [item.code, item]))
  const reads = new Map<string, YardStockRead>()
  for (const raw of text.split(/\n|[,，;；。]+/)) {
    const part = raw.trim()
    if (!part) continue
    const lower = part.toLowerCase()
    const sku = skus.find((row) => stocked.has(row.code) && [row.name, row.code, row.nameZh, ...row.aliases].some((alias) => alias.trim().length >= 2 && lower.includes(alias.toLowerCase())))
    const code = sku?.code ?? part.match(/\b\d{2}-[\w-]+/)?.[0]?.toUpperCase()
    if (!code || !stocked.has(code)) continue
    const name = sku?.name ?? products.find((p) => p.code === code)?.name ?? code
    const sizeFree = part.replace(/\b\d{2}-[\w-]+/g, ' ').replace(/\bY\d{1,2}\b/gi, ' ').replace(/\d+\s*(mm|kg|m\b|cm)/gi, ' ')
    const num = sizeFree.match(/(\d[\d,]*(?:\.\d+)?)/)?.[1]
    const qty = num ? Number(num.replace(/,/g, '')) : null
    if (OUT.test(part) && qty === null) reads.set(code, { code, name, action: 'count', qty: 0, text: part })
    else if (qty !== null && IN.test(part) && !LEFT.test(part.replace(/\bada\b/i, ''))) reads.set(code, { code, name, action: 'receive', qty, text: part })
    else if (qty !== null) reads.set(code, { code, name, action: 'count', qty, text: part })
    else if (LOW.test(part)) reads.set(code, { code, name, action: 'check', qty: null, text: part })
  }
  return [...reads.values()]
}

/* ---------- seed ---------- */

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function hash(text: string): number {
  let h = 0
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

// What the yard holds of the legacy desk items, matching their seeded signals (Y12 没货, cement / sand / BRC 少).
const LEGACY: Record<string, { onHand: number; reorderAt: number; reorderQty: number; avgCost: number; supplier: string; leadDays: number; bin: string }> = {
  'RED-BRICK': { onHand: 180, reorderAt: 60, reorderQty: 200, avgCost: 36, supplier: 'Clay brick kiln (demo)', leadDays: 3, bin: 'Yard A1' },
  PAVER: { onHand: 90, reorderAt: 30, reorderQty: 100, avgCost: 19, supplier: 'Paver plant (demo)', leadDays: 4, bin: 'Yard A2' },
  'RIVER-SAND': { onHand: 3, reorderAt: 3, reorderQty: 6, avgCost: 210, supplier: 'Sand quarry (demo)', leadDays: 1, bin: 'Bay S' },
  STONE: { onHand: 8, reorderAt: 3, reorderQty: 6, avgCost: 240, supplier: 'Quarry (demo)', leadDays: 1, bin: 'Bay Q' },
  'CEMENT-50': { onHand: 140, reorderAt: 150, reorderQty: 600, avgCost: 17.2, supplier: 'Cement mill (demo)', leadDays: 2, bin: 'Store C1' },
  'EMIX-SKIM': { onHand: 140, reorderAt: 60, reorderQty: 200, avgCost: 13.8, supplier: 'Emix', leadDays: 3, bin: 'Store C2' },
  'OKA-300': { onHand: 45, reorderAt: 20, reorderQty: 60, avgCost: 26, supplier: 'OKA', leadDays: 5, bin: 'Yard P1' },
  'U-DRAIN': { onHand: 60, reorderAt: 20, reorderQty: 80, avgCost: 17.5, supplier: 'Precast plant (demo)', leadDays: 5, bin: 'Yard P2' },
  'CEM-BOARD': { onHand: 120, reorderAt: 40, reorderQty: 150, avgCost: 23, supplier: 'Prima / UAC', leadDays: 4, bin: 'Store B1' },
  Y12: { onHand: 4, reorderAt: 40, reorderQty: 120, avgCost: 148, supplier: 'Steel mill (demo)', leadDays: 2, bin: 'Steel rack 1' },
  'BRC-A7': { onHand: 22, reorderAt: 20, reorderQty: 60, avgCost: 70, supplier: 'Steel mill (demo)', leadDays: 2, bin: 'Steel rack 2' },
}

// A yard-sized slice of the EMAS master: things a trader keeps on the ground. Quantities and costs are demo.
const PICK: { category: string; take: number; base: [onHand: number, reorderAt: number, cost: number]; supplier?: string; bin: string }[] = [
  { category: 'Cement', take: 5, base: [300, 150, 17], bin: 'Store C1' },
  { category: 'Skim coat, render & plaster', take: 5, base: [120, 50, 14], bin: 'Store C2' },
  { category: 'Tile adhesive & grout', take: 5, base: [80, 30, 24], bin: 'Store C3' },
  { category: 'Waterproofing', take: 3, base: [30, 12, 95], bin: 'Store C4' },
  { category: 'BRC & wire mesh', take: 4, base: [40, 15, 70], supplier: 'Steel mill (demo)', bin: 'Steel rack 2' },
  { category: 'Wire & nails', take: 4, base: [60, 20, 45], bin: 'Store H1' },
  { category: 'Clay common bricks', take: 4, base: [20000, 8000, 0.32], supplier: 'Clay brick kiln (demo)', bin: 'Yard A1' },
  { category: 'Sand bricks', take: 2, base: [15000, 6000, 0.28], bin: 'Yard A3' },
  { category: 'Lightweight (AAC) blocks', take: 3, base: [900, 300, 5.6], bin: 'Yard B1' },
  { category: 'Plywood', take: 3, base: [150, 50, 42], bin: 'Store B2' },
  { category: 'Fibre cement boards', take: 3, base: [100, 40, 28], supplier: 'Prima / UAC', bin: 'Store B1' },
  { category: 'Plastic sheets & film', take: 2, base: [40, 15, 85], bin: 'Store H2' },
]

export function seedInventory(skus: Sku[], now = new Date('2026-11-04T08:00:00')): Pick<DeskData, 'stockItems' | 'stockMoves' | 'purchaseOrders' | 'stockCounts'> {
  const counted = '2026-10-31T17:00:00'
  const items: StockItem[] = []
  for (const sku of skus) {
    const l = LEGACY[sku.code]
    if (!l) continue
    items.push({ code: sku.code, onHand: l.onHand, reorderAt: l.reorderAt, reorderQty: l.reorderQty, avgCost: l.avgCost, supplier: l.supplier, leadDays: l.leadDays, bin: l.bin, lastCountAt: counted, checkFlag: null })
  }
  for (const pick of PICK) {
    const list = EMAS_PRODUCTS.filter((p) => p.category === pick.category).slice(0, pick.take)
    list.forEach((p, i) => {
      const h = hash(p.code)
      const wobble = 0.5 + (h % 100) / 100
      const [onHand, reorderAt, cost] = pick.base
      // Every fourth item sits under its re-order level so the re-stock list has something on day one.
      const low = (h >>> 3) % 4 === 0
      const qty = Math.round(low ? reorderAt * 0.6 : onHand * wobble)
      items.push({
        code: p.code,
        onHand: qty,
        reorderAt,
        reorderQty: Math.round(onHand * 0.8),
        avgCost: r2(cost * (0.85 + ((h >>> 5) % 30) / 100)),
        supplier: pick.supplier ?? p.brand ?? `${pick.category} supplier (demo)`,
        leadDays: 2 + (h % 5),
        bin: `${pick.bin}-${i + 1}`,
        lastCountAt: (h >>> 7) % 3 === 0 ? '2026-09-30T17:00:00' : counted,
        checkFlag: null,
      })
    })
  }
  const moves: StockMove[] = items.map((item) => ({
    id: `mv-open-${item.code}`,
    at: counted,
    code: item.code,
    kind: 'opening',
    qty: item.onHand,
    balance: item.onHand,
    ref: 'Count Oct 2026',
    by: 'Stock count',
    note: 'Month-end count (opening balance)',
  }))
  const y12 = items.find((item) => item.code === 'Y12')
  const pos: PurchaseOrder[] = y12
    ? [
        {
          id: 'PO-2601',
          supplier: y12.supplier,
          createdAt: '2026-11-02T10:00:00',
          expected: addDays(now.toISOString().slice(0, 10), 2),
          status: 'sent',
          lines: [{ code: 'Y12', qty: 120, received: 0, cost: 150 }],
          note: 'Y12 lorry — yard says Thursday',
        },
      ]
    : []
  return { stockItems: items, stockMoves: moves, purchaseOrders: pos, stockCounts: [] }
}
