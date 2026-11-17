import type { Ageing, Source, Stage, StockSignal, View } from './types.ts'

export const VIEWS: View[] = ['dashboard', 'confirm', 'board', 'hold', 'audit', 'prices', 'pricedesk', 'pricecheck', 'commission', 'stock', 'clients', 'payments', 'customers', 'whatsapp', 'document']

export const BOARD_STAGES: Stage[] = ['new', 'needs_approval', 'confirmed', 'preparing', 'delivered']

export const STAGE_LABEL: Record<Stage, string> = {
  new: 'New',
  needs_approval: 'HQ Hold',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

export const SOURCE_LABEL: Record<Source, string> = {
  text: 'Note',
  photo: 'Photo',
  pdf: 'PDF',
  voice: 'Voice',
}

export const SIGNAL: Record<StockSignal, { en: string; zh: string; hint: string }> = {
  enough: { en: 'Enough', zh: '有货', hint: 'Yard can cover the usual run' },
  low: { en: 'Low', zh: '少', hint: 'Getting thin — check before you promise a time' },
  out: { en: 'Out', zh: '没货', hint: 'Yard says there is none right now' },
}

export const AGEING_LABEL: Record<Ageing, string> = {
  ok: 'Current',
  '30': '30 days',
  '60': '60 days',
  '90': '90 days',
}

export const PAGE: Record<View, { title: string; lede: string }> = {
  pricecheck: {
    title: 'Price check',
    lede: 'For the sales team: pick an item and a town, get today’s price for any quantity. Always the latest — it reads the Price Desk live. The same answer comes back on WhatsApp: “price a-plas shah alam 200”.',
  },
  dashboard: {
    title: 'Today at the desk',
    lede: 'Sales against target for WH1–WH5, GP, commission and receivables — then what needs a person before the yard moves.',
  },
  confirm: {
    title: 'Confirm queue',
    lede: 'Original note on one side, the lines we read on the other. Fix anything, then confirm.',
  },
  board: {
    title: 'Order board',
    lede: 'New orders wait for a check. Credit problems stop in HQ Hold. Drag a card, or use the buttons.',
  },
  hold: {
    title: 'HQ Hold',
    lede: 'Credit and overdue stops land here first. HQ clears what is inside its authority and escalates the rest to the boss.',
  },
  audit: {
    title: 'Audit log',
    lede: 'Every HQ approval and boss decision, newest first. Entries are append-only — nothing here can be edited or deleted.',
  },
  prices: {
    title: 'Quick tiers',
    lede: 'Fallback tiers, no cost. Under 15 is Price A. From 15 to 19 is Price B. 20 and above is Price C.',
  },
  pricedesk: {
    title: 'Price Desk',
    lede: 'Find any of the 3,768 items by group, category, brand or name, type the new prices, publish. Everyone is told, the sales WhatsApp group gets the new prices, and the change is logged. A sales order locks its price on the day it is raised.',
  },
  commission: {
    title: 'Commission',
    lede: 'Month-end salesperson commission. Attainment sets the rate, and the rate is paid on gross profit, not on sales.',
  },
  stock: {
    title: 'Stock',
    lede: 'Counted stock for the demo yard, on the same item codes as the Price Desk: what is on hand, what is booked, what to re-order, and the counts that keep it honest.',
  },
  clients: {
    title: 'Credit',
    lede: 'Limit, ageing, and what they still owe. That is what the desk looks at before saying yes.',
  },
  payments: {
    title: 'Payments in',
    lede: 'A salesperson says “received the cheque” on WhatsApp. HQ confirms it here, the balance and ageing drop, and held orders that now pass credit go to the yard.',
  },
  customers: {
    title: 'Customers',
    lede: 'Who is ordering, who ordered last, and who has gone quiet — from EMAS invoices plus the board.',
  },
  document: {
    title: 'Order document',
    lede: 'Sales Order while Confirmed. Delivery Order once the yard is preparing.',
  },
  whatsapp: {
    title: 'Sales WhatsApp',
    lede: 'Switch between salesperson conversations, check orders and follow up collections. Simulated inbox; nothing is sent to WhatsApp.',
  },
}

/** One colour per order stage (CSS tokens in index.css). Always shown next to the stage name, never alone. */
export const STAGE_COLOR: Record<Stage, string> = {
  new: 'var(--color-stage-new)',
  needs_approval: 'var(--color-stage-hold)',
  confirmed: 'var(--color-stage-confirmed)',
  preparing: 'var(--color-stage-preparing)',
  delivered: 'var(--color-stage-delivered)',
  cancelled: 'var(--color-stage-cancelled)',
}
