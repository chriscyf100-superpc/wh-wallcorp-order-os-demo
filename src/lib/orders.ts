import { creditVerdict } from './credit.ts'
import { clearLock, lockOrderLines, todayISO, type DeskContextData } from './pricedesk.ts'
import { withDo, withSoMeta } from './documents.ts'
import { orderTotal } from './pricing.ts'
import { STAGE_LABEL } from './labels.ts'
import type { Client, Order, Sku, Stage } from './types.ts'

const YARD: Stage[] = ['confirmed', 'preparing', 'delivered']

export function findClient(clients: Client[], id: string | null): Client | null {
  if (!id) return null
  return clients.find((client) => client.id === id) ?? null
}

export function clientName(clients: Client[], id: string | null): string {
  return findClient(clients, id)?.company ?? 'Unmatched sender'
}

export function findSku(skus: Sku[], id: string): Sku | undefined {
  return skus.find((sku) => sku.id === id)
}

export function judgeOrder(order: Order, clients: Client[]) {
  return creditVerdict(findClient(clients, order.clientId), orderTotal(order.lines))
}

export function lineSummary(order: Order, skus: Sku[]): string {
  if (order.lines.length === 0) return 'No lines yet'
  const parts: string[] = []
  const cap = Math.min(order.lines.length, 3)
  for (let i = 0; i < cap; i += 1) {
    const line = order.lines[i]
    if (!line) continue
    const sku = findSku(skus, line.skuId)
    parts.push(`${sku?.name ?? 'Item'} × ${line.qty}`)
  }
  if (order.lines.length > 3) parts.push(`+${order.lines.length - 3}`)
  return parts.join(', ')
}

export function openDemand(orders: Order[], skuId: string): { qty: number; orders: number } {
  let qty = 0
  let count = 0
  for (const order of orders) {
    if (order.stage !== 'confirmed' && order.stage !== 'preparing') continue
    let hit = 0
    for (const line of order.lines) {
      if (line.skuId === skuId) hit += line.qty
    }
    if (hit > 0) {
      qty += hit
      count += 1
    }
  }
  return { qty, orders: count }
}

export function nextOrderId(orders: Order[]): string {
  let max = 2410
  for (const order of orders) {
    const n = Number(order.id.replace('WH-', ''))
    if (Number.isFinite(n) && n > max) max = n
  }
  return `WH-${max + 1}`
}

export interface LockContext extends DeskContextData {
  skus: Sku[]
  date?: string
}

// Raising the SO: stamp the Price Desk sell + cost onto the lines. Already-locked lines keep their stamp.
function raise(order: Order, lock: LockContext | undefined, clients: Client[]): Order {
  const withMeta = withSoMeta(order, clients)
  if (!lock) return withMeta
  const locked = lockOrderLines(withMeta, lock.skus, lock, lock.date ?? todayISO())
  return locked.stage === 'preparing' ? withDo(locked, clients, lock.skus) : locked
}

// Delivered = invoiced that day (demo rule). The invoice date is what puts the order into a commission month.
export function relocateOrder(
  order: Order,
  stage: Stage,
  clients: Client[],
  lock?: LockContext,
): { order: Order; toast: string } {
  const moved = relocate(order, stage, clients, lock)
  if (moved.order.stage === 'delivered' && order.stage !== 'delivered' && !moved.order.invoicedAt) {
    return { ...moved, order: { ...moved.order, invoicedAt: todayISO(lock?.date ? new Date(lock.date) : new Date()), paidAt: null } }
  }
  return moved
}

function relocate(
  order: Order,
  stage: Stage,
  clients: Client[],
  lock?: LockContext,
): { order: Order; toast: string } {
  if (order.stage === stage) return { order, toast: '' }
  if (YARD.includes(stage) && order.lines.length === 0) {
    return { order, toast: `${order.id} needs at least one line before it can move on.` }
  }

  const verdict = judgeOrder(order, clients)

  if (order.stage === 'new' && YARD.includes(stage)) {
    if (verdict.flag) {
      return {
        order: {
          ...order,
          stage: 'needs_approval',
          creditFlag: true,
          creditReason: verdict.reason,
          approved: false,
          hold: { status: 'hq', escalations: 0 },
        },
        toast: `${order.id} needs HQ approval. ${verdict.reason ?? ''}`.trim(),
      }
    }
    return {
      order: raise({ ...order, stage, creditFlag: false, creditReason: null, approved: false }, lock, clients),
      toast:
        stage === 'confirmed' ? `${order.id} confirmed.` : `${order.id} moved to ${STAGE_LABEL[stage]}.`,
    }
  }

  if (order.stage === 'needs_approval' && YARD.includes(stage)) {
    // The only way out of HQ Hold into the yard is an HQ or boss approval (see hold.ts).
    if (order.hold?.status !== 'approved') {
      return { order, toast: `${order.id} is in HQ Hold. Approve it in HQ Hold, or escalate to the boss.` }
    }
    return {
      order: raise({ ...order, stage, approved: true, creditFlag: true }, lock, clients),
      toast:
        stage === 'confirmed'
          ? `${order.id} approved. The yard can take it.`
          : `${order.id} approved and moved to ${STAGE_LABEL[stage]}.`,
    }
  }

  if (stage === 'needs_approval') {
    if (order.stage !== 'new') {
      return { order, toast: `${order.id} can only enter HQ Hold from the confirm queue, through the credit check.` }
    }
    return {
      order: {
        ...order,
        stage,
        approved: false,
        creditFlag: true,
        creditReason: verdict.reason ?? 'Held by the desk for a look.',
        hold: { status: 'hq', escalations: 0 },
      },
      toast: `${order.id} held for HQ.`,
    }
  }

  if (stage === 'new') {
    if (order.stage === 'needs_approval' && order.hold && order.hold.status !== 'hq') {
      return {
        order,
        toast:
          order.hold.status === 'rejected'
            ? `${order.id} was rejected by the boss. It cannot go back to confirm — cancel it, or re-escalate with a new reason.`
            : `${order.id} is with the boss. Wait for the decision.`,
      }
    }
    return {
      order: {
        ...order,
        stage,
        approved: false,
        creditFlag: false,
        creditReason: null,
        hold: undefined,
        lines: order.lines.map(clearLock),
      },
      toast: `${order.id} is back in the confirm queue.`,
    }
  }

  if (stage === 'cancelled') {
    return { order: { ...order, stage }, toast: `${order.id} cancelled.` }
  }

  if (stage === 'preparing' && lock) {
    // The Delivery Order is made here, from the SO as it stands now.
    const prepared = withDo(withSoMeta({ ...order, stage }, clients), clients, lock.skus)
    return { order: prepared, toast: `${order.id} is preparing. ${prepared.doNumber} created — ready to print.` }
  }

  return { order: { ...order, stage }, toast: `${order.id} moved to ${STAGE_LABEL[stage]}.` }
}
