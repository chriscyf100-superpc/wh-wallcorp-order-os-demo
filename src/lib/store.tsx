import { collectionRisk } from './collections.ts'
import { resumeAfterPayment } from './hold.ts'
import { STAGE_LABEL } from './labels.ts'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { passwordMatches } from './auth.ts'
import { creditVerdict } from './credit.ts'
import { rm } from './format.ts'
import { bossDecide, escalate, hqApprove, reEscalate, type HoldResult } from './hold.ts'
import { findClient, nextOrderId, relocateOrder } from './orders.ts'
import { parseOrderText } from './parser.ts'
import { draftSell, isLocked, repriceDrafts, zoneForClient } from './pricedesk.ts'
import { orderTotal } from './pricing.ts'
import { applyPriceCsv } from './pricesheet.ts'
import { buildSeed } from './seed.ts'
import { withCatalog } from './catalog.ts'
import { confirmPayment, paymentFromMessage, rejectPayment, type PaymentResult } from './payments.ts'
import { readYardNote } from './stock.ts'
import { draftPurchaseOrders, issueForDelivery, postCount, postMoves, readYardStock, receivePurchase, startCount, syncSignals } from './inventory.ts'
import { currentVersion, dayBefore, isSheetRow, sheetRows, tabName, type SheetVersion } from './tileSheet.ts'
import { applyCards, broadcastText, makeChange, sheetChange, type CardRow } from './priceUpdate.ts'
import { looksLikePriceCheck, priceReply } from './quote.ts'
import { monthKeyNow, monthKeyOf, personMonth, personPipeline } from './commission.ts'
import { loadDesk, readAuth, saveDesk, writeAuth } from './storage.ts'
import type { DeliveryMode, DeskData, Notice, PoStatus, StockItem, OrderLine, PriceChange, Payment, PriceDeskRow, Source, Stage, StockChange, StockSignal } from './types.ts'
import { DeskContext, type Desk, type OrderMeta, type Pulse, type Toast } from './useDesk.ts'
import { uid } from './utils.ts'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value * 100) / 100))
}

// A published price change reaches everyone: the change log, a desk notice, and the sales WhatsApp group.
function announce(current: DeskData, change: PriceChange): DeskData {
  const notice: Notice = {
    id: uid('ntc'),
    at: change.at,
    kind: 'price',
    title: `New prices from ${tabName(change.effectiveFrom)}`,
    body: `${change.title} — ${change.summary}.`,
    refId: change.id,
    read: false,
  }
  return {
    ...current,
    priceLog: [change, ...current.priceLog],
    notices: [notice, ...current.notices].slice(0, 50),
    messages: [...current.messages, { id: uid('msg'), from: 'hq', broadcast: true, text: broadcastText(change), source: 'text', at: change.at }],
  }
}

function lockContext(current: DeskData) {
  return { skus: current.skus, products: current.products, priceRows: current.priceRows }
}

export function DeskProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DeskData>(loadDesk)
  const dataRef = useRef(data)
  const [authed, setAuthed] = useState(readAuth)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [pulse, setPulse] = useState<Pulse | null>(null)

  useEffect(() => {
    dataRef.current = data
    saveDesk(data)
  }, [data])

  useEffect(() => {
    if (!pulse) return
    const timer = window.setTimeout(() => setPulse(null), 15_000)
    return () => window.clearTimeout(timer)
  }, [pulse])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const ping = useCallback((text: string, view?: Toast['view']) => {
    if (!text) return
    setToast({ text, nonce: Date.now(), view })
  }, [])

  const login = useCallback((password: string) => {
    if (!passwordMatches(password)) return false
    writeAuth(true)
    setAuthed(true)
    return true
  }, [])

  const logout = useCallback(() => {
    writeAuth(false)
    setAuthed(false)
  }, [])

  const sendOrder = useCallback(
    (raw: string, source: Source, salesperson = 'Boon') => {
      const text = raw.trim().slice(0, 2000)
      if (!text) {
        ping('Paste an order first.')
        return
      }
      const current = dataRef.current
      const at = new Date().toISOString()
      if (/^(my orders|all my orders|我的订单|订单状态|pesanan saya)[.!? ]*$/i.test(text)) {
        const own = current.orders.filter(o => o.salesperson === salesperson).toSorted((a,b) => b.createdAt.localeCompare(a.createdAt))
        const reply = own.length ? own.map(o => `${o.id} · ${findClient(current.clients, o.clientId)?.company ?? 'Unmatched'} · ${rm(orderTotal(o.lines))} · ${o.hold?.status === 'rejected' ? 'Pending payment — ' + o.hold.rejectReason : STAGE_LABEL[o.stage]}${o.soNumber ? ' · ' + o.soNumber : ''}`).join('\n') : 'No orders for you yet.'
        const next: DeskData = { ...current, messages: [...current.messages,
          { id: uid('msg'), from: 'sales', salesperson, text, source, at },
          { id: uid('msg'), from: 'hq', salesperson, text: reply, source: 'text', at }] }
        dataRef.current = next; setData(next); return
      }
      if (looksLikePriceCheck(text)) {
        const reply = priceReply(text, { products: withCatalog(current.products), skus: current.skus, priceRows: current.priceRows })
        const next: DeskData = {
          ...current,
          messages: [
            ...current.messages,
            { id: uid('msg'), from: 'sales', salesperson, text, source, at },
            { id: uid('msg'), from: 'hq', salesperson, text: reply.text, source: 'text', at },
          ],
        }
        dataRef.current = next
        setData(next)
        ping('Price check answered on WhatsApp from the live Price Desk.', 'pricecheck')
        return
      }
      const payment = paymentFromMessage(text, current, salesperson, at)
      if (payment) {
        const client = current.clients.find((row) => row.id === payment.clientId)
        const reply = client
          ? `Noted — ${rm(payment.amount)} ${payment.method === 'cheque' ? 'cheque' : payment.method === 'cash' ? 'cash' : 'transfer'} from ${client.company}. HQ will confirm it against the bank, then the account and any held orders update.`
          : `Noted ${rm(payment.amount)}. Which customer is it from? HQ will attach it before confirming.`
        const next: DeskData = {
          ...current,
          payments: [{ ...payment, rawMessage: text }, ...current.payments],
          messages: [
            ...current.messages,
            { id: uid('msg'), from: 'sales', salesperson, text, source, at },
            { id: uid('msg'), from: 'hq', salesperson, text: reply, source: 'text', at },
          ],
        }
        dataRef.current = next
        setData(next)
        ping(`Payment note from ${salesperson}: ${rm(payment.amount)}${client ? ` · ${client.company}` : ''}. Waiting for HQ in Payments in.`, 'payments')
        return
      }
      const orderId = nextOrderId(current.orders)
      const parsed = parseOrderText(text, current.skus, current.clients)
        const client = findClient(current.clients, parsed.clientId)
        const routing = { zone: zoneForClient(client), deliveryMode: 'direct' as DeliveryMode }
        const lines: OrderLine[] = []
        for (const item of parsed.items) {
          const sku = current.skus.find((row) => row.id === item.skuId)
          if (!sku) continue
          lines.push({
            id: uid('line'),
            skuId: sku.id,
            qty: item.qty,
            unitPrice: draftSell(routing, sku, item.qty, current),
            customPrice: false,
          })
        }
        const createdAt = new Date().toISOString()
        const verdict = creditVerdict(client, orderTotal(lines))
        const total = orderTotal(lines)
      let reply = `${orderId} is in the confirm queue.`
      let toastText = `${orderId} landed in the confirm queue.`
      if (lines.length === 0) {
        reply = `${orderId} is in the confirm queue. I couldn't read any lines — add them on the desk.`
        toastText = `${orderId} is in the queue. No lines read — add them by hand.`
      } else if (verdict.flag) {
        reply = `${orderId} is in the confirm queue. ${verdict.reason ?? 'HQ needs to approve it.'}`
        toastText = `${orderId} landed in the confirm queue. Credit needs a look.`
      } else {
        const noun = lines.length === 1 ? 'line' : 'lines'
        reply = `${orderId} is in the confirm queue. ${lines.length} ${noun}, ${rm(total)}. Credit looks clear.`
      }
      const next: DeskData = {
        ...current,
        orders: [
            {
              id: orderId,
              clientId: parsed.clientId,
              rawMessage: text,
              source,
              lines,
              stage: 'new',
              createdAt,
              salesperson,
              creditFlag: false,
              creditReason: null,
              approved: false,
              ...routing,
            },
            ...current.orders,
          ],
          messages: [
            ...current.messages,
            { id: uid('msg'), from: 'sales', salesperson, text, source, at: createdAt, orderId },
            { id: uid('msg'), from: 'hq', salesperson, text: reply, source: 'text', at: createdAt, orderId },
          ],
      }
      dataRef.current = next
      setData(next)
      setHighlightId(orderId)
      ping(toastText, 'confirm')
    },
    [ping],
  )

  const updateLine = useCallback(
    (orderId: string, lineId: string, patch: { qty?: number; unitPrice?: number; customPrice?: false }) => {
      setData((current) => ({
        ...current,
        orders: current.orders.map((order) => {
          if (order.id !== orderId) return order
          return {
            ...order,
            lines: order.lines.map((line) => {
              if (line.id !== lineId) return line
              if (isLocked(line)) return line
              const sku = current.skus.find((row) => row.id === line.skuId)
              if (patch.customPrice === false && sku) {
                return { ...line, customPrice: false, unitPrice: draftSell(order, sku, line.qty, current) }
              }
              if (patch.qty !== undefined) {
                const qty = clamp(patch.qty, 1, 100000)
                if (line.customPrice || !sku) return { ...line, qty }
                return { ...line, qty, unitPrice: draftSell(order, sku, qty, current) }
              }
              if (patch.unitPrice !== undefined) {
                return { ...line, unitPrice: clamp(patch.unitPrice, 0, 1000000), customPrice: true }
              }
              return line
            }),
          }
        }),
      }))
    },
    [],
  )

  const addLine = useCallback((orderId: string, skuId: string, qty: number) => {
    setData((current) => {
      const sku = current.skus.find((row) => row.id === skuId)
      if (!sku) return current
      const safeQty = clamp(qty, 1, 100000)
      return {
        ...current,
        orders: current.orders.map((order) => {
          if (order.id !== orderId) return order
          if (order.lines.some((line) => line.skuId === skuId)) return order
          return {
            ...order,
            lines: [
              ...order.lines,
              {
                id: uid('line'),
                skuId,
                qty: safeQty,
                unitPrice: draftSell(order, sku, safeQty, current),
                customPrice: false,
              },
            ],
          }
        }),
      }
    })
  }, [])

  const removeLine = useCallback((orderId: string, lineId: string) => {
    setData((current) => ({
      ...current,
      orders: current.orders.map((order) =>
        order.id === orderId ? { ...order, lines: order.lines.filter((line) => line.id !== lineId) } : order,
      ),
    }))
  }, [])

  const setOrderClient = useCallback((orderId: string, clientId: string | null) => {
    setData((current) => ({
      ...current,
      orders: current.orders.map((order) => (order.id === orderId ? { ...order, clientId } : order)),
    }))
  }, [])

  const applyMove = useCallback(
    (orderId: string, stage: Stage): Stage | undefined => {
      const current = dataRef.current
      const order = current.orders.find((row) => row.id === orderId)
      if (!order) return undefined
      const moved = relocateOrder(order, stage, current.clients, {
        skus: current.skus,
        products: current.products,
        priceRows: current.priceRows,
      })
      if (moved.order !== order) {
        const placed = { ...current, orders: current.orders.map((row) => (row.id === orderId ? moved.order : row)) }
        // Delivered takes stocked lines out of the yard; any move changes what is reserved.
        const next = syncSignals(moved.order.stage === 'delivered' && order.stage !== 'delivered' ? issueForDelivery(placed, moved.order) : placed)
        dataRef.current = next
        setData(next)
        const money = commissionNote(current, next, moved.order)
        if (money) {
          setPulse({ salesperson: moved.order.salesperson, nonce: Date.now() })
          ping(`${moved.toast} ${money}`, 'commission')
          return moved.order.stage
        }
      }
      ping(moved.toast, stage === 'new' ? 'confirm' : 'board')
      return moved.order.stage
    },
    [ping],
  )

  const setOrderMeta = useCallback((orderId: string, patch: OrderMeta) => {
    setData((current) => ({
      ...current,
      orders: current.orders.map((order) => (order.id === orderId ? { ...order, ...patch } : order)),
    }))
  }, [])

  const runHold = useCallback(
    (step: (current: DeskData, at: string) => HoldResult, view: Toast['view'] = 'hold') => {
      const current = dataRef.current
      const result = step(current, new Date().toISOString())
      if (result.data !== current) {
        dataRef.current = result.data
        setData(result.data)
        const changed = result.data.orders.find((row) => {
          const before = current.orders.find((old) => old.id === row.id)
          return before && before.stage !== row.stage
        })
        const money = changed ? commissionNote(current, result.data, changed) : null
        if (changed && money) {
          setPulse({ salesperson: changed.salesperson, nonce: Date.now() })
          ping(`${result.toast} ${money}`, view)
          return
        }
      }
      ping(result.toast, view)
    },
    [ping],
  )


  const setOrderRouting = useCallback((orderId: string, patch: { zone?: string; deliveryMode?: DeliveryMode }) => {
    setData((current) => ({
      ...current,
      orders: repriceDrafts(
        current.orders.map((order) =>
          order.id === orderId && order.stage !== 'confirmed' && order.stage !== 'preparing' && order.stage !== 'delivered'
            ? { ...order, ...patch }
            : order,
        ),
        current.skus,
        current,
      ),
    }))
  }, [])

  const savePriceRow = useCallback((row: Omit<PriceDeskRow, 'id'> & { id?: string }) => {
    setData((current) => {
      const saved: PriceDeskRow = { ...row, id: row.id ?? uid('pd') }
      const exists = current.priceRows.some((existing) => existing.id === saved.id)
      const priceRows = exists
        ? current.priceRows.map((existing) => (existing.id === saved.id ? saved : existing))
        : [saved, ...current.priceRows]
      const next = { ...current, priceRows }
      // Open (unlocked) drafts follow the desk. Locked lines never change.
      return { ...next, orders: repriceDrafts(next.orders, next.skus, next) }
    })
  }, [])

  const deletePriceRow = useCallback((rowId: string) => {
    setData((current) => {
      const next = { ...current, priceRows: current.priceRows.filter((row) => row.id !== rowId) }
      return { ...next, orders: repriceDrafts(next.orders, next.skus, next) }
    })
  }, [])

  const setStockMany = useCallback((skuIds: string[], stock: StockSignal, by = 'HQ desk') => {
    setData((current) => {
      const at = new Date().toISOString()
      const log: StockChange[] = []
      const skus = current.skus.map((sku) => {
        if (!skuIds.includes(sku.id) || sku.stock === stock) return sku
        log.push({ id: uid('stk'), at, skuId: sku.id, from: sku.stock, to: stock, by })
        return { ...sku, stock, stockAt: at }
      })
      if (log.length === 0) return current
      return { ...current, skus, stockLog: [...log, ...current.stockLog].slice(0, 200) }
    })
  }, [])

  const setStock = useCallback((skuId: string, stock: StockSignal) => setStockMany([skuId], stock), [setStockMany])

  const applyYardNote = useCallback(
    (text: string) => {
      const current = dataRef.current
      const reads = readYardNote(text, current.skus).filter((read) => read.sku.stock !== read.to)
      if (reads.length === 0) {
        ping('Nothing to change — no item with a clear 有货 / 少 / 没货 word.', 'stock')
        return 0
      }
      const at = new Date().toISOString()
      const log: StockChange[] = reads.map((read) => ({ id: uid('stk'), at, skuId: read.sku.id, from: read.sku.stock, to: read.to, by: 'Yard (WhatsApp)' }))
      const next: DeskData = {
        ...current,
        skus: current.skus.map((sku) => {
          const read = reads.find((row) => row.sku.id === sku.id)
          return read ? { ...sku, stock: read.to, stockAt: at } : sku
        }),
        stockLog: [...log, ...current.stockLog].slice(0, 200),
      }
      dataRef.current = next
      setData(next)
      ping(`Yard note read: ${reads.map((read) => `${read.sku.name} → ${read.to}`).join(', ')}.`, 'stock')
      return reads.length
    },
    [ping],
  )

  const runPayment = useCallback(
    (step: (current: DeskData, at: string) => PaymentResult) => {
      const current = dataRef.current
      const result = step(current, new Date().toISOString())
      if (result.data !== current) {
        dataRef.current = result.data
        setData(result.data)
        const released = result.data.orders.find((row) => {
          const before = current.orders.find((old) => old.id === row.id)
          return before && before.stage === 'needs_approval' && row.stage === 'confirmed'
        })
        if (released) setHighlightId(released.id)
      }
      ping(result.toast, 'payments')
    },
    [ping],
  )

  const recordPayment = useCallback(
    (input: Omit<Payment, 'id' | 'status' | 'reportedAt'>, confirmNow: boolean) => {
      const at = new Date().toISOString()
      const payment: Payment = { ...input, id: uid('pay'), status: 'reported', reportedAt: at }
      runPayment((current) => {
        const withIt = { ...current, payments: [payment, ...current.payments] }
        if (!confirmNow) return { data: withIt, toast: `Payment ${rm(payment.amount)} logged. Confirm it once the money is seen.` }
        return confirmPayment(withIt, payment.id, at, lockContext(withIt))
      })
    },
    [runPayment],
  )

  const setPaymentClient = useCallback((paymentId: string, clientId: string | null) => {
    setData((current) => ({
      ...current,
      payments: current.payments.map((row) => (row.id === paymentId && row.status === 'reported' ? { ...row, clientId } : row)),
    }))
  }, [])

  const commitStock = useCallback(
    (step: (current: DeskData, at: string) => DeskData, toast?: string) => {
      const current = dataRef.current
      const next = step(current, new Date().toISOString())
      if (next === current) return
      dataRef.current = next
      setData(next)
      if (toast) ping(toast, 'stock')
    },
    [ping],
  )

  const stockAdjust = useCallback(
    (code: string, change: { qty?: number; setTo?: number }, reason: string) =>
      commitStock((current, at) => postMoves(current, [{ code, qty: change.qty ?? 0, setTo: change.setTo, kind: change.setTo !== undefined ? 'count' : 'adjust', ref: 'Desk', note: reason }], 'HQ desk', at)),
    [commitStock],
  )

  const addStockItems = useCallback(
    (codes: string[]) =>
      commitStock((current) => {
        const have = new Set(current.stockItems.map((item) => item.code))
        const products = withCatalog(current.products)
        const added: StockItem[] = codes
          .filter((code) => !have.has(code))
          .map((code) => {
            const p = products.find((row) => row.code === code)
            return { code, onHand: 0, reorderAt: 0, reorderQty: 0, avgCost: 0, supplier: p?.brand ?? 'Supplier (set me)', leadDays: 3, bin: '', lastCountAt: null, checkFlag: null }
          })
        return added.length === 0 ? current : { ...current, stockItems: [...current.stockItems, ...added] }
      }, `${codes.length} item${codes.length === 1 ? '' : 's'} added to the yard list. Count ${codes.length === 1 ? 'it' : 'them'} to set the quantity.`),
    [commitStock],
  )

  const updateStockItem = useCallback(
    (code: string, patch: Partial<Pick<StockItem, 'reorderAt' | 'reorderQty' | 'supplier' | 'leadDays' | 'bin' | 'avgCost'>>) =>
      commitStock((current) => syncSignals({ ...current, stockItems: current.stockItems.map((item) => (item.code === code ? { ...item, ...patch } : item)) })),
    [commitStock],
  )

  const removeStockItem = useCallback(
    (code: string) => commitStock((current) => ({ ...current, stockItems: current.stockItems.filter((item) => item.code !== code || item.onHand !== 0) })),
    [commitStock],
  )

  const createPurchaseOrders = useCallback(
    (lines: { code: string; qty: number }[]) =>
      commitStock((current, at) => {
        const result = draftPurchaseOrders(current, lines, at)
        return result.data
      }, 'Purchase order drafts made, one per supplier. Check them, then mark sent.'),
    [commitStock],
  )

  const setPurchaseStatus = useCallback(
    (poId: string, status: PoStatus) =>
      commitStock((current) => ({ ...current, purchaseOrders: current.purchaseOrders.map((po) => (po.id === poId ? { ...po, status } : po)) }), status === 'sent' ? `${poId} marked sent. It now counts as on order.` : undefined),
    [commitStock],
  )

  const setPurchaseLine = useCallback(
    (poId: string, code: string, qty: number) =>
      commitStock((current) => ({
        ...current,
        purchaseOrders: current.purchaseOrders.map((po) =>
          po.id === poId && po.status === 'draft' ? { ...po, lines: po.lines.map((line) => (line.code === code ? { ...line, qty: Math.max(0, qty) } : line)).filter((line) => line.qty > 0) } : po,
        ),
      })),
    [commitStock],
  )

  const receivePO = useCallback(
    (poId: string, got: Record<string, number>) => commitStock((current, at) => receivePurchase(current, poId, got, at), `Goods received on ${poId}. On hand and average cost updated.`),
    [commitStock],
  )

  const beginCount = useCallback(
    (codes: string[], name: string) => {
      const current = dataRef.current
      const result = startCount(current, codes, name)
      dataRef.current = result.data
      setData(result.data)
      ping(`${name}: ${result.count.lines.length} items to count.`, 'stock')
      return result.count.id
    },
    [ping],
  )

  const setCountLine = useCallback(
    (countId: string, code: string, counted: number | null) =>
      commitStock((current) => ({
        ...current,
        stockCounts: current.stockCounts.map((count) =>
          count.id === countId && !count.postedAt ? { ...count, lines: count.lines.map((line) => (line.code === code ? { ...line, counted } : line)) } : count,
        ),
      })),
    [commitStock],
  )

  const finishCount = useCallback(
    (countId: string) => commitStock((current, at) => postCount(current, countId, at), 'Count posted. Differences went in as adjustments.'),
    [commitStock],
  )

  const discardCount = useCallback(
    (countId: string) => commitStock((current) => ({ ...current, stockCounts: current.stockCounts.filter((count) => count.id !== countId || count.postedAt) })),
    [commitStock],
  )

  const applyYardStock = useCallback(
    (text: string) => {
      const current = dataRef.current
      const reads = readYardStock(text, current.skus, current.stockItems, withCatalog(current.products))
      if (reads.length === 0) {
        ping('Nothing read — name a stocked item with a number (“Y12 tinggal 30”) or a word (没货 / sikit).', 'stock')
        return 0
      }
      const at = new Date().toISOString()
      let next = postMoves(
        current,
        reads
          .filter((read) => read.action !== 'check' && read.qty !== null)
          .map((read) =>
            read.action === 'receive'
              ? { code: read.code, qty: read.qty ?? 0, kind: 'receive' as const, ref: 'Yard WhatsApp', note: read.text }
              : { code: read.code, qty: 0, setTo: read.qty ?? 0, kind: 'count' as const, ref: 'Yard WhatsApp', note: read.text },
          ),
        'Yard (WhatsApp)',
        at,
      )
      const checks = reads.filter((read) => read.action === 'check')
      if (checks.length > 0) {
        next = { ...next, stockItems: next.stockItems.map((item) => (checks.some((c) => c.code === item.code) ? { ...item, checkFlag: `Yard said “${checks.find((c) => c.code === item.code)?.text}”` } : item)) }
      }
      dataRef.current = next
      setData(next)
      ping(`Yard note: ${reads.length} item${reads.length === 1 ? '' : 's'} updated${checks.length ? `, ${checks.length} flagged for a count` : ''}.`, 'stock')
      return reads.length
    },
    [ping],
  )

  const publishSheet = useCallback(
    (sheetId: string, draft: Omit<SheetVersion, 'id' | 'tab' | 'createdAt'>) => {
      const current = dataRef.current
      const sheet = current.priceSheets.find((row) => row.id === sheetId)
      if (!sheet) return
      const at = new Date().toISOString()
      const version: SheetVersion = { ...draft, id: uid('ms'), tab: tabName(draft.effectiveFrom), createdAt: at }
      const before = currentVersion(sheet, dayBefore(draft.effectiveFrom))
      const versions = [version, ...sheet.versions.filter((row) => row.effectiveFrom !== draft.effectiveFrom)].toSorted((a, b) =>
        b.effectiveFrom.localeCompare(a.effectiveFrom),
      )
      const nextSheet = { ...sheet, versions }
      const priceRows = [...sheetRows(nextSheet), ...current.priceRows.filter((row) => !isSheetRow(row, sheet))]
      const base = { ...current, priceSheets: current.priceSheets.map((row) => (row.id === sheetId ? nextSheet : row)), priceRows }
      const repriced = { ...base, orders: repriceDrafts(base.orders, base.skus, { ...base, products: withCatalog(base.products) }) }
      const next = announce(repriced, sheetChange(sheet, before, version, at, draft.by))
      dataRef.current = next
      setData(next)
      ping(`${sheet.title} — sheet ${version.tab} published. Everyone notified; sales WhatsApp group sent the new prices. Locked SOs keep their price.`, 'pricedesk')
    },
    [ping],
  )

  const publishCards = useCallback(
    (input: { cards: { code: string; rows: CardRow[] }[]; effectiveFrom: string; title: string; kind: 'card' | 'bulk'; note: string }) => {
      const current = dataRef.current
      if (input.cards.length === 0) return
      const at = new Date().toISOString()
      const products = withCatalog(current.products)
      const result = applyCards(current.priceRows, products, input.cards, input.effectiveFrom, input.note)
      const base = { ...current, priceRows: result.priceRows }
      const repriced = { ...base, orders: repriceDrafts(base.orders, base.skus, { ...base, products }) }
      const change = makeChange({ at, by: 'HQ', kind: input.kind, title: input.title, effectiveFrom: input.effectiveFrom, codes: input.cards.map((card) => card.code), lines: result.lines })
      const next = announce(repriced, change)
      dataRef.current = next
      setData(next)
      ping(`${input.title} — published from ${tabName(input.effectiveFrom)}. Everyone notified. Locked SOs keep their price.`, 'pricedesk')
    },
    [ping],
  )

  const readNotices = useCallback(() => {
    setData((current) => (current.notices.some((n) => !n.read) ? { ...current, notices: current.notices.map((n) => ({ ...n, read: true })) } : current))
  }, [])

  const setTier = useCallback((skuId: string, index: number, patch: { minQty?: number; price?: number }) => {
    setData((current) => ({
      ...current,
      skus: current.skus.map((sku) => {
        if (sku.id !== skuId) return sku
        const tiers = sku.tiers.map((tier, tierIndex) => {
          if (tierIndex !== index) return tier
          return {
            ...tier,
            minQty: patch.minQty !== undefined ? clamp(patch.minQty, 1, 100000) : tier.minQty,
            price: patch.price !== undefined ? clamp(patch.price, 0, 1000000) : tier.price,
          }
        })
        return { ...sku, tiers }
      }),
    }))
  }, [])

  const loadPrices = useCallback(
    (csv: string, fileName: string) => {
      const current = dataRef.current
      const result = applyPriceCsv(current.skus, csv)
      if ('error' in result) {
        ping(result.error, 'prices')
        return { ok: false, message: result.error }
      }
      const next = {
        ...current,
        skus: result.skus,
        orders: repriceDrafts(current.orders, result.skus, current),
        priceFileName: fileName,
      }
      dataRef.current = next
      setData(next)
      ping(result.summary, 'prices')
      return { ok: true, message: result.summary }
    },
    [ping],
  )

  const resetDemo = useCallback(() => {
    const next = buildSeed()
    dataRef.current = next
    setData(next)
    setHighlightId(null)
    ping('Demo data is back to the meeting set.')
  }, [ping])

  const highlightOrder = useCallback((orderId: string) => {
    setHighlightId(orderId)
  }, [])

  const dismissToast = useCallback(() => setToast(null), [])
  const products = useMemo(() => withCatalog(data.products), [data.products])

  const value: Desk = {
    skus: data.skus,
    clients: data.clients,
    orders: data.orders,
    messages: data.messages,
    auditLog: data.auditLog,
    products,
    priceRows: data.priceRows,
    payments: data.payments,
    stockLog: data.stockLog,
    priceSheets: data.priceSheets,
    priceLog: data.priceLog,
    notices: data.notices,
    priceFileName: data.priceFileName,
    salespeople: data.salespeople,
    commissionAdjustments: data.commissionAdjustments,
    highlightId,
    toast,
    pulse,
    authed,
    login,
    logout,
    sendOrder,
    updateLine,
    addLine,
    removeLine,
    setOrderClient,
    confirmOrder: (orderId) => applyMove(orderId, 'confirmed'),
    approveOrder: (orderId) => runHold((current, at) => hqApprove(current, orderId, at, lockContext(current))),
    hqApprove: (orderId) => runHold((current, at) => hqApprove(current, orderId, at, lockContext(current))),
    escalate: (orderIds) => runHold((current, at) => escalate(current, orderIds, at)),
    bossDecide: (orderId, approve, reason) =>
      runHold((current, at) => bossDecide(current, orderId, approve, reason, at, lockContext(current))),
    notifyCollection: (clientId, salesperson) => {
      const current = dataRef.current
      const client = current.clients.find(c => c.id === clientId)
      if (!client) return
      const risk = collectionRisk(client, current.orders)
      const text = `${salesperson}, please follow up ${client.company}: owes ${rm(client.outstanding)}, open SO commitments ${rm(risk.committed)}. ${risk.average === null ? 'No completed-order history to estimate the next deal.' : `Average completed deal ${rm(risk.average)}; estimated next-order shortfall ${rm(risk.shortage)}.`} ${risk.overdue ? '60/90-day overdue balance also blocks credit.' : ''}`
      const next: DeskData = { ...current, messages: [...current.messages, { id: uid('msg'), from: 'hq', salesperson, text, source: 'text', at: new Date().toISOString() }] }
      dataRef.current = next; setData(next); ping('Collection reminder added to the salesperson inbox (simulation).', 'whatsapp')
    },
    resumeAfterPayment: orderId => runHold((current, at) => resumeAfterPayment(current, orderId, at, lockContext(current))),
    reEscalate: (orderId, reason) => runHold((current, at) => reEscalate(current, orderId, reason, at)),
    moveOrder: applyMove,
    setOrderMeta,
    setOrderRouting,
    savePriceRow,
    deletePriceRow,
    setStock,
    setStockMany,
    applyYardNote,
    confirmPayment: (paymentId) => runPayment((current, at) => confirmPayment(current, paymentId, at, lockContext(current))),
    rejectPayment: (paymentId, reason) => runPayment((current, at) => rejectPayment(current, paymentId, reason, at)),
    recordPayment,
    setPaymentClient,
    stockItems: data.stockItems,
    stockMoves: data.stockMoves,
    purchaseOrders: data.purchaseOrders,
    stockCounts: data.stockCounts,
    stockAdjust,
    addStockItems,
    updateStockItem,
    removeStockItem,
    createPurchaseOrders,
    setPurchaseStatus,
    setPurchaseLine,
    receivePO,
    beginCount,
    setCountLine,
    finishCount,
    discardCount,
    applyYardStock,
    publishSheet,
    publishCards,
    readNotices,
    setTier,
    loadPrices,
    resetDemo,
    highlightOrder,
    dismissToast,
  }

  return <DeskContext.Provider value={value}>{children}</DeskContext.Provider>
}

const money = (value: number): string => `RM ${Math.round(value).toLocaleString('en-MY')}`
const signed = (value: number): string => `${value >= 0 ? '+' : '−'}${money(Math.abs(value))}`
const signedSen = (value: number): string => `${value >= 0 ? '+' : '−'}${rm(Math.abs(value))}`

// One line for the toast: how this move changed the salesperson's pipeline or invoiced month.
function commissionNote(before: DeskData, after: DeskData, order: DeskData['orders'][number]): string | null {
  const person = after.salespeople.find((row) => row.name === order.salesperson)
  if (!person) return null
  const tag = `${person.name} (${person.code})`
  if (order.stage === 'delivered') {
    const month = order.invoicedAt ? monthKeyOf(order.invoicedAt) : monthKeyNow()
    const was = personMonth(before.orders, before.clients, person, before.commissionAdjustments, month)
    const now = personMonth(after.orders, after.clients, person, after.commissionAdjustments, month)
    if (now.revenue === was.revenue) return null
    return `${tag}: sales ${signed(now.revenue - was.revenue)}, GP ${signed(now.gp - was.gp)}, commission ${signedSen(now.net - was.net)} → ${rm(now.net)}.`
  }
  const was = personPipeline(before.orders, person)
  const now = personPipeline(after.orders, person)
  if (now.sell === was.sell) return null
  return now.sell > was.sell
    ? `${signed(now.sell - was.sell)} joins ${tag}’s pipeline. It counts toward commission once delivered.`
    : `${tag}’s pipeline ${signed(now.sell - was.sell)}.`
}
