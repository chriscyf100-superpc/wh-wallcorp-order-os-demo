export type Unit = 'bundle' | 'bag' | 'pcs' | 'load'

export type Stage = 'new' | 'needs_approval' | 'confirmed' | 'preparing' | 'delivered' | 'cancelled'

export type Ageing = 'ok' | '30' | '60' | '90'

export type StockSignal = 'enough' | 'low' | 'out'

export type Source = 'text' | 'photo' | 'pdf' | 'voice'

export type View = 'pricecheck' | 'dashboard' | 'confirm' | 'board' | 'hold' | 'audit' | 'prices' | 'pricedesk' | 'commission' | 'stock' | 'clients' | 'payments' | 'customers' | 'whatsapp' | 'document'

export interface Tier {
  minQty: number
  price: number
  label: string
}

export interface Sku {
  id: string
  code: string
  name: string
  nameZh: string
  aliases: string[]
  unit: Unit
  unitZh: string
  tiers: Tier[]
  stock: StockSignal
  // When the yard last changed the signal (ISO). Absent on seeded rows.
  stockAt?: string
}

export interface Client {
  id: string
  company: string
  aliases: string[]
  creditLimit: number
  outstanding: number
  ageing: Ageing
  area: string
  phone: string
  whitelist?: boolean
  debtorNo?: string
  address?: string
  termDays?: number
  // Outstanding split by age (EMAS ageing). Sums to outstanding. Payments clear the oldest bucket first.
  buckets?: Record<Ageing, number>
  lastPaymentAt?: string
}

export type DeliveryMode = 'any' | 'crane' | 'no_crane' | 'own_collection' | 'loose' | 'shop_site' | 'direct'

export type TierUnit = 'unit' | 'pallet'

export interface Product {
  code: string
  name: string
  uom: string
  category: string
  // Top-level group for the finder (Roofing, Bricks & blocks …) and the brand read from the description.
  group?: string
  brand?: string
  palletQty?: number
  // 'emas' = from the EMAS item code listing (read-only master); absent = demo item.
  source?: 'emas'
  // EMAS selling price A (most are 0.0000 in the listing).
  listA?: number
}

export interface PriceDeskRow {
  id: string
  code: string
  zone: string
  mode: DeliveryMode
  tierUnit: TierUnit
  minQty: number
  sell: number
  cost: number
  effectiveFrom: string
  effectiveTo: string | null
  note: string
}

export type LockSource = 'desk' | 'typed' | 'tier'

export interface OrderLine {
  id: string
  skuId: string
  qty: number
  unitPrice: number
  customPrice: boolean
  lockedSell?: number
  lockedCost?: number | null
  lockDate?: string
  lockRowId?: string | null
  lockSource?: LockSource
}

export interface Order {
  id: string
  clientId: string | null
  rawMessage: string
  source: Source
  lines: OrderLine[]
  stage: Stage
  createdAt: string
  salesperson: string
  creditFlag: boolean
  creditReason: string | null
  approved: boolean
  hold?: HoldInfo
  zone?: string
  deliveryMode?: DeliveryMode
  soNumber?: string
  poNumber?: string
  term?: string
  deliverySite?: string
  deliveryDate?: string
  contactTel?: string
  addressSnapshot?: string
  doNumber?: string
  doCreatedAt?: string
  doSnapshot?: DoSnapshot
  // Commission inputs. invoicedAt is a YYYY-MM-DD date; paidAt is null/absent while the customer has not paid.
  invoicedAt?: string
  paidAt?: string | null
}

export interface DoLine {
  code: string
  desc: string
  qty: number
  unit: string
}

// Frozen copy of the SO at the moment the order entered Preparing. No prices: the yard copy.
export interface DoSnapshot {
  customer: string
  debtorNo: string
  address: string
  site: string
  date: string
  tel: string
  lines: DoLine[]
}

export type HoldStatus = 'hq' | 'escalated' | 'approved' | 'rejected'

export interface HoldInfo {
  status: HoldStatus
  escalations: number
  escalatedAt?: string
  decidedBy?: 'HQ' | 'Boss'
  decidedAt?: string
  rejectReason?: string
  reEscalateReason?: string
}

export type AuditAction = 'hq_approve' | 'escalate' | 'boss_approve' | 'boss_reject' | 're_escalate' | 'payment_release'

export interface AuditEntry {
  id: string
  at: string
  orderId: string
  clientName: string
  who: 'HQ' | 'Boss'
  action: AuditAction
  amount: number
  overRm: number
  agingMonths: number
  reason: string
  cc: string | null
}

export interface WaMessage {
  salesperson?: string
  broadcast?: boolean
  id: string
  from: 'sales' | 'hq'
  text: string
  source: Source
  at: string
  orderId?: string
}

// 'sheet' people are the frozen Sep'26 HQ summary; 'live' people roll up from orders on the board.
export type CommissionBasis = 'sheet' | 'live'

export interface Salesperson {
  id: string
  code: string
  name: string
  monthTarget: number
  basis: CommissionBasis
  // Set when HQ pays this person outside the ladder. Base and early-pay are held at zero.
  exception?: string
}

// Negative amount = commission clawed back (credit note). month is YYYY-MM, the month it is deducted.
export interface CommissionAdjustment {
  id: string
  salespersonId: string
  month: string
  amount: number
  reason: string
}

import type { PriceSheet } from './tileSheet.ts'

export type PayMethod = 'cheque' | 'transfer' | 'cash'
export type PaymentStatus = 'reported' | 'confirmed' | 'rejected'

// A payment the salesperson reports on WhatsApp ("received cheque RM 8,400 from Bina Maju"), or HQ keys in.
// It only touches the credit book once HQ confirms it (cheque cleared / money seen in the bank).
export interface Payment {
  id: string
  clientId: string | null
  amount: number
  method: PayMethod
  ref: string
  reportedBy: string
  reportedAt: string
  receivedOn: string
  status: PaymentStatus
  rawMessage?: string
  decidedAt?: string
  rejectReason?: string
  // Filled on confirm: what it did.
  settledOrders?: string[]
  releasedOrders?: string[]
  outstandingBefore?: number
  outstandingAfter?: number
}

export interface StockChange {
  id: string
  at: string
  skuId: string
  from: StockSignal
  to: StockSignal
  by: string
}

// One published price change, kept for the change log.
export interface PriceChangeLine {
  code: string
  label: string
  before: number | null
  after: number
}

export interface PriceChange {
  id: string
  at: string
  by: string
  // sheet = Monier price sheet, card = one product's price card, bulk = several products moved together
  kind: 'sheet' | 'card' | 'bulk'
  title: string
  effectiveFrom: string
  codes: string[]
  summary: string
  // Every selling price that moved (capped for storage); before is null for a brand-new price.
  lines: PriceChangeLine[]
  more: number
}

// A desk-wide notice. "Everyone" in the demo = every desk user plus the sales WhatsApp group.
export interface Notice {
  id: string
  at: string
  kind: 'price'
  title: string
  body: string
  refId: string
  read: boolean
}

// ---- Inventory (counted, one yard) ----

// One stocked item at the Shah Alam yard, keyed by the same product code as the Price Desk.
export interface StockItem {
  code: string
  onHand: number
  // Re-stock when available + on order falls to this; order this much.
  reorderAt: number
  reorderQty: number
  // Moving average cost per unit (RM), from goods received.
  avgCost: number
  supplier: string
  leadDays: number
  bin: string
  lastCountAt: string | null
  // Set when the yard says low / out but the system disagrees — goes on the next count.
  checkFlag: string | null
}

export type MoveKind = 'receive' | 'issue' | 'adjust' | 'count' | 'opening'

export interface StockMove {
  id: string
  at: string
  code: string
  kind: MoveKind
  // Signed: + in, − out
  qty: number
  balance: number
  ref: string
  by: string
  note: string
}

export type PoStatus = 'draft' | 'sent' | 'partial' | 'received' | 'cancelled'

export interface PurchaseOrder {
  id: string
  supplier: string
  createdAt: string
  expected: string
  status: PoStatus
  lines: { code: string; qty: number; received: number; cost: number }[]
  note: string
}

export interface StockCount {
  id: string
  name: string
  startedAt: string
  postedAt: string | null
  // counted is null until someone enters it; system is frozen when the count starts.
  lines: { code: string; system: number; counted: number | null }[]
}

export interface DeskData {
  version: 1
  skus: Sku[]
  clients: Client[]
  orders: Order[]
  messages: WaMessage[]
  auditLog: AuditEntry[]
  products: Product[]
  priceRows: PriceDeskRow[]
  priceFileName: string | null
  salespeople: Salesperson[]
  commissionAdjustments: CommissionAdjustment[]
  payments: Payment[]
  stockLog: StockChange[]
  priceSheets: PriceSheet[]
  priceLog: PriceChange[]
  notices: Notice[]
  stockItems: StockItem[]
  stockMoves: StockMove[]
  purchaseOrders: PurchaseOrder[]
  stockCounts: StockCount[]
}

export interface CreditVerdict {
  flag: boolean
  reason: string | null
  watch: string | null
}
