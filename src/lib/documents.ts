import type { Client, DoSnapshot, Order, Sku, Stage } from './types.ts'

export const COMPANY = 'W&H WALLCORP SDN. BHD.'
export const COMPANY_REG = ''

function findClient(clients: Client[], id: string | null): Client | null {
  return id ? (clients.find((client) => client.id === id) ?? null) : null
}

const SO_STAGES: Stage[] = ['confirmed', 'preparing', 'delivered']

function suffix(order: Order): string {
  const n = Number(order.id.replace('WH-', ''))
  const base = Number.isFinite(n) ? n + 3000 : 0
  return String(base).padStart(5, '0')
}

export function soNumberFor(order: Order): string {
  return `SO${suffix(order)}`
}

export function doNumberFor(order: Order): string {
  return `DO${suffix(order)}`
}

export function termLabel(client: Client | null): string {
  if (!client || client.termDays === undefined) return ''
  return client.termDays === 0 ? 'C.O.D.' : `${client.termDays} DAYS`
}

export function debtorNo(client: Client | null): string {
  return client?.debtorNo ?? client?.id.toUpperCase() ?? ''
}

export function lineQtyLabel(sku: Sku | undefined, qty: number): string {
  return `${qty.toLocaleString('en-MY', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${(sku?.unit ?? '').toUpperCase()}`
}

export function snapshotDo(order: Order, clients: Client[], skus: Sku[]): DoSnapshot {
  const client = findClient(clients, order.clientId)
  return {
    customer: client?.company ?? 'Unmatched sender',
    debtorNo: debtorNo(client),
    address: order.addressSnapshot ?? client?.address ?? '',
    site: order.deliverySite ?? '',
    date: order.deliveryDate ?? '',
    tel: order.contactTel ?? '',
    lines: order.lines.map((line) => {
      const sku = skus.find((row) => row.id === line.skuId)
      return { code: sku?.code ?? '', desc: sku?.name ?? 'Item', qty: line.qty, unit: sku?.unit ?? '' }
    }),
  }
}

// Fill the SO meta the first time (never overwrite what sales typed).
export function withSoMeta(order: Order, clients: Client[]): Order {
  const client = findClient(clients, order.clientId)
  return {
    ...order,
    soNumber: order.soNumber ?? soNumberFor(order),
    poNumber: order.poNumber ?? '',
    term: order.term ?? termLabel(client),
    deliverySite:
      order.deliverySite ?? (order.deliveryMode === 'own_collection' ? 'OWN COLLECTION' : (client?.area ?? '').toUpperCase()),
    deliveryDate: order.deliveryDate ?? 'ASAP',
    contactTel: order.contactTel ?? client?.phone ?? '',
    addressSnapshot: order.addressSnapshot ?? client?.address ?? '',
  }
}

// Entering Preparing: DO number is created once, the snapshot is refreshed from the SO.
export function withDo(order: Order, clients: Client[], skus: Sku[], at = new Date().toISOString()): Order {
  return {
    ...order,
    doNumber: order.doNumber ?? doNumberFor(order),
    doCreatedAt: order.doCreatedAt ?? at,
    doSnapshot: snapshotDo(order, clients, skus),
  }
}

// Backfill for saved/seeded orders already past the stage that makes each document.
export function withDocuments(order: Order, clients: Client[], skus: Sku[]): Order {
  let next = order
  if (SO_STAGES.includes(next.stage) && !next.soNumber) next = withSoMeta(next, clients)
  if ((next.stage === 'preparing' || next.stage === 'delivered') && !next.doNumber) {
    next = withDo(next, clients, skus, next.createdAt)
  }
  return next
}
