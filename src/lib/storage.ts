import { withDocuments } from './documents.ts'
import { buildSeed } from './seed.ts'
import type { DeskData } from './types.ts'

export const STORAGE_KEY = 'wh-wallcorp-order-os-v6'
export const AUTH_KEY = 'wh-wallcorp-demo-auth'

function isDeskData(value: unknown): value is DeskData {
  if (!value || typeof value !== 'object') return false
  const data = value as DeskData
  return (
    data.version === 1 &&
    Array.isArray(data.skus) &&
    Array.isArray(data.clients) &&
    Array.isArray(data.orders) &&
    Array.isArray(data.messages)
  )
}

export function loadDesk(): DeskData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return buildSeed()
    const parsed: unknown = JSON.parse(raw)
    if (!isDeskData(parsed)) return buildSeed()
    const seed = buildSeed()
    // Orders saved before SO/DO existed get numbers and a snapshot; clients get debtor codes.
    const clients = parsed.clients.map((client) => {
      const fresh = seed.clients.find((row) => row.id === client.id)
      return { ...fresh, ...client, debtorNo: client.debtorNo ?? fresh?.debtorNo, address: client.address ?? fresh?.address, termDays: client.termDays ?? fresh?.termDays }
    })
    const skus = parsed.skus
    // A desk saved before Commission has no history orders or invoice dates. Add them without touching live orders.
    const preCommission = !Array.isArray(parsed.salespeople)
    const savedOrders = preCommission
      ? [
          ...parsed.orders.map((order) => (order.id === 'WH-2409' && !order.invoicedAt ? { ...order, invoicedAt: '2026-11-02', paidAt: null } : order)),
          ...seed.orders.filter((order) => /^WH-23\d\d$/.test(order.id) && !parsed.orders.some((saved) => saved.id === order.id)),
        ]
      : parsed.orders
    return {
      ...parsed,
      clients,
      orders: savedOrders.map((order) => withDocuments(order, clients, skus)),
      auditLog: Array.isArray(parsed.auditLog) ? parsed.auditLog : [],
      products: Array.isArray(parsed.products) ? parsed.products : seed.products,
      priceRows: Array.isArray(parsed.priceRows) ? parsed.priceRows : seed.priceRows,
      priceFileName: typeof parsed.priceFileName === 'string' ? parsed.priceFileName : null,
      salespeople: Array.isArray(parsed.salespeople) ? parsed.salespeople : seed.salespeople,
      commissionAdjustments: Array.isArray(parsed.commissionAdjustments) ? parsed.commissionAdjustments : seed.commissionAdjustments,
      payments: Array.isArray(parsed.payments) ? parsed.payments : seed.payments,
      stockLog: Array.isArray(parsed.stockLog) ? parsed.stockLog : [],
      priceSheets: Array.isArray(parsed.priceSheets) ? parsed.priceSheets : seed.priceSheets,
      priceLog: Array.isArray(parsed.priceLog) ? parsed.priceLog : seed.priceLog,
      notices: Array.isArray(parsed.notices) ? parsed.notices : seed.notices,
      stockItems: Array.isArray(parsed.stockItems) ? parsed.stockItems : seed.stockItems,
      stockMoves: Array.isArray(parsed.stockMoves) ? parsed.stockMoves : seed.stockMoves,
      purchaseOrders: Array.isArray(parsed.purchaseOrders) ? parsed.purchaseOrders : seed.purchaseOrders,
      stockCounts: Array.isArray(parsed.stockCounts) ? parsed.stockCounts : seed.stockCounts,
    }
  } catch {
    return buildSeed()
  }
}

export function saveDesk(data: DeskData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Storage can be full or blocked. The meeting still runs in memory.
  }
}

export function readAuth(): boolean {
  try {
    return sessionStorage.getItem(AUTH_KEY) === 'yes'
  } catch {
    return false
  }
}

export function writeAuth(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(AUTH_KEY, 'yes')
    else sessionStorage.removeItem(AUTH_KEY)
  } catch {
    // Ignore private-mode storage failures.
  }
}
