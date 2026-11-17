import { monthKeyOf } from './commission.ts'
import { todayISO } from './pricedesk.ts'
import { orderTotal } from './pricing.ts'
import type { Client, Order, Sku } from './types.ts'

// One invoice in the customer ledger. Board orders are live; 'emas' rows are demo history standing in for
// the EMAS invoice listing until that export is wired in.
export interface LedgerRow {
  ref: string
  clientId: string
  date: string
  amount: number
  salesperson: string
  source: 'board' | 'emas'
  items?: string
}

const PEOPLE = ['Boon', 'Geh', 'Lye Seng', 'Jt', 'Han']

// Deterministic per-customer rhythm: gap between orders (days), typical size, who looks after them,
// and how long ago they last ordered (a few are drifting away on purpose).
function rhythm(client: Client, index: number) {
  let hash = 0
  for (const ch of client.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  const gap = 6 + (hash % 17)
  const size = Math.round((client.creditLimit || 15000) * (0.18 + ((hash >>> 5) % 20) / 100))
  const person = PEOPLE[(hash >>> 3) % PEOPLE.length]
  const drift = [0, 2, 1, 4, 0, 9, 3, 0, 1, 52, 0, 71, 5, 52, 9, 38, 71, 6, 24, 3, 64][index % 21]
  return { gap, size, person, drift, hash }
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + days))
  return next.toISOString().slice(0, 10)
}

export function demoLedger(clients: Client[], now = new Date()): LedgerRow[] {
  const today = todayISO(now)
  const start = addDays(today, -400)
  const rows: LedgerRow[] = []
  clients.forEach((client, index) => {
    const { gap, size, person, drift, hash } = rhythm(client, index)
    let date = addDays(today, -(drift + 1))
    let n = 0
    let seed = hash
    while (date >= start) {
      seed = (seed * 1103515245 + 12345) >>> 0
      const wobble = 0.55 + (seed % 900) / 1000
      rows.push({
        ref: `INV-${client.debtorNo ?? client.id}-${String(n + 1).padStart(3, '0')}`,
        clientId: client.id,
        date,
        amount: Math.round(size * wobble),
        salesperson: (seed >>> 8) % 5 === 0 ? PEOPLE[(seed >>> 4) % PEOPLE.length] : person,
        source: 'emas',
      })
      n += 1
      date = addDays(date, -Math.max(3, Math.round(gap * (0.6 + ((seed >>> 12) % 80) / 100))))
    }
  })
  return rows
}

export function boardLedger(orders: Order[], skus: Sku[]): LedgerRow[] {
  return orders
    .filter((order) => order.clientId && order.stage !== 'cancelled' && order.lines.length > 0)
    .map((order) => ({
      ref: order.soNumber ? `${order.id} · ${order.soNumber}` : order.id,
      clientId: order.clientId ?? '',
      date: order.invoicedAt ?? todayISO(new Date(order.createdAt)),
      amount: orderTotal(order.lines),
      salesperson: order.salesperson,
      source: 'board' as const,
      items: order.lines
        .map((line) => skus.find((sku) => sku.id === line.skuId)?.name)
        .filter(Boolean)
        .join(', '),
    }))
}

export type Activity = 'active' | 'quiet' | 'dormant' | 'none'

export interface CustomerRow {
  client: Client
  last: LedgerRow | null
  daysSince: number | null
  activity: Activity
  orders12m: number
  sales12m: number
  salesYtd: number
  avgOrder: number
  mainPerson: string
  // last 12 calendar months, oldest first
  monthly: number[]
  rows: LedgerRow[]
}

export function daysBetween(a: string, b: string): number {
  const t = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)))
  return Math.round((t(b) - t(a)) / 86_400_000)
}

export function activityOf(days: number | null): Activity {
  if (days === null) return 'none'
  if (days <= 14) return 'active'
  if (days <= 45) return 'quiet'
  return 'dormant'
}

export function customerRows(clients: Client[], orders: Order[], skus: Sku[], now = new Date()): CustomerRow[] {
  const today = todayISO(now)
  const ledger = [...demoLedger(clients, now), ...boardLedger(orders, skus)]
  const yearStart = `${today.slice(0, 4)}-01-01`
  const from12 = addDays(today, -365)
  const months: string[] = []
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return clients.map((client) => {
    const rows = ledger.filter((row) => row.clientId === client.id).toSorted((a, b) => b.date.localeCompare(a.date) || (a.source === 'board' ? -1 : 1))
    const last = rows[0] ?? null
    const daysSince = last ? daysBetween(last.date, today) : null
    const recent = rows.filter((row) => row.date >= from12)
    const sales12m = recent.reduce((sum, row) => sum + row.amount, 0)
    const people = new Map<string, number>()
    for (const row of recent) people.set(row.salesperson, (people.get(row.salesperson) ?? 0) + row.amount)
    return {
      client,
      last,
      daysSince,
      activity: activityOf(daysSince),
      orders12m: recent.length,
      sales12m,
      salesYtd: rows.filter((row) => row.date >= yearStart).reduce((sum, row) => sum + row.amount, 0),
      avgOrder: recent.length > 0 ? sales12m / recent.length : 0,
      mainPerson: [...people.entries()].toSorted((a, b) => b[1] - a[1])[0]?.[0] ?? '—',
      monthly: months.map((key) => rows.filter((row) => monthKeyOf(row.date) === key).reduce((sum, row) => sum + row.amount, 0)),
      rows,
    }
  })
}
