import { createContext, useContext } from 'react'
import type { DeliveryMode, Order, DeskData, PoStatus, StockItem, Payment, PriceDeskRow, Source, Stage, StockSignal, View } from './types.ts'
import type { SheetVersion } from './tileSheet.ts'
import type { CardRow } from './priceUpdate.ts'

export interface Toast {
  text: string
  nonce: number
  view?: View
}

// Set when a stage move changes someone's commission month, so screens can flash that row.
export interface Pulse {
  salesperson: string
  nonce: number
}

export type OrderMeta = Partial<Pick<Order, 'poNumber' | 'term' | 'deliverySite' | 'deliveryDate' | 'contactTel'>>

export interface Desk {
  skus: DeskData['skus']
  clients: DeskData['clients']
  orders: DeskData['orders']
  messages: DeskData['messages']
  auditLog: DeskData['auditLog']
  products: DeskData['products']
  priceRows: DeskData['priceRows']
  priceFileName: string | null
  salespeople: DeskData['salespeople']
  commissionAdjustments: DeskData['commissionAdjustments']
  payments: DeskData['payments']
  stockLog: DeskData['stockLog']
  priceSheets: DeskData['priceSheets']
  priceLog: DeskData['priceLog']
  notices: DeskData['notices']
  highlightId: string | null
  toast: Toast | null
  pulse: Pulse | null
  authed: boolean
  login: (password: string) => boolean
  logout: () => void
  sendOrder: (text: string, source: Source, salesperson?: string) => void
  updateLine: (orderId: string, lineId: string, patch: { qty?: number; unitPrice?: number; customPrice?: false }) => void
  addLine: (orderId: string, skuId: string, qty: number) => void
  removeLine: (orderId: string, lineId: string) => void
  setOrderClient: (orderId: string, clientId: string | null) => void
  confirmOrder: (orderId: string) => Stage | undefined
  approveOrder: (orderId: string) => void
  hqApprove: (orderId: string) => void
  escalate: (orderIds: string[]) => void
  bossDecide: (orderId: string, approve: boolean, reason: string) => void
  resumeAfterPayment: (orderId: string) => void
  notifyCollection: (clientId: string, salesperson: string) => void
  reEscalate: (orderId: string, reason: string) => void
  moveOrder: (orderId: string, stage: Stage) => void
  setOrderMeta: (orderId: string, patch: OrderMeta) => void
  setOrderRouting: (orderId: string, patch: { zone?: string; deliveryMode?: DeliveryMode }) => void
  savePriceRow: (row: Omit<PriceDeskRow, 'id'> & { id?: string }) => void
  deletePriceRow: (rowId: string) => void
  setStock: (skuId: string, stock: StockSignal) => void
  setStockMany: (skuIds: string[], stock: StockSignal) => void
  applyYardNote: (text: string) => number
  confirmPayment: (paymentId: string) => void
  rejectPayment: (paymentId: string, reason: string) => void
  recordPayment: (input: Omit<Payment, 'id' | 'status' | 'reportedAt'>, confirmNow: boolean) => void
  setPaymentClient: (paymentId: string, clientId: string | null) => void
  publishSheet: (sheetId: string, draft: Omit<SheetVersion, 'id' | 'tab' | 'createdAt'>) => void
  publishCards: (input: { cards: { code: string; rows: CardRow[] }[]; effectiveFrom: string; title: string; kind: 'card' | 'bulk'; note: string }) => void
  readNotices: () => void
  stockItems: DeskData['stockItems']
  stockMoves: DeskData['stockMoves']
  purchaseOrders: DeskData['purchaseOrders']
  stockCounts: DeskData['stockCounts']
  stockAdjust: (code: string, change: { qty?: number; setTo?: number }, reason: string) => void
  addStockItems: (codes: string[]) => void
  updateStockItem: (code: string, patch: Partial<Pick<StockItem, 'reorderAt' | 'reorderQty' | 'supplier' | 'leadDays' | 'bin' | 'avgCost'>>) => void
  removeStockItem: (code: string) => void
  createPurchaseOrders: (lines: { code: string; qty: number }[]) => void
  setPurchaseStatus: (poId: string, status: PoStatus) => void
  setPurchaseLine: (poId: string, code: string, qty: number) => void
  receivePO: (poId: string, got: Record<string, number>) => void
  beginCount: (codes: string[], name: string) => string
  setCountLine: (countId: string, code: string, counted: number | null) => void
  finishCount: (countId: string) => void
  discardCount: (countId: string) => void
  applyYardStock: (text: string) => number
  setTier: (skuId: string, index: number, patch: { minQty?: number; price?: number }) => void
  loadPrices: (csv: string, fileName: string) => { ok: boolean; message: string }
  resetDemo: () => void
  highlightOrder: (orderId: string) => void
  dismissToast: () => void
}

export const DeskContext = createContext<Desk | null>(null)

export function useDesk(): Desk {
  const desk = useContext(DeskContext)
  if (!desk) throw new Error('useDesk must be used inside DeskProvider')
  return desk
}
