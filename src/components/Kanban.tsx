import { ChevronRight, Search } from 'lucide-react'
import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { rm, whenLabel } from '../lib/format.ts'
import { BOARD_STAGES, STAGE_COLOR, STAGE_LABEL } from '../lib/labels.ts'
import { authorityFor } from '../lib/hold.ts'
import { clientName, lineSummary } from '../lib/orders.ts'
import { lockedTotals } from '../lib/pricedesk.ts'
import { orderTotal } from '../lib/pricing.ts'
import { openDocument } from '../lib/useView.ts'
import { useDesk } from '../lib/useDesk.ts'
import type { Order, Stage } from '../lib/types.ts'
import { cn } from '../lib/utils.ts'
import { HoldPill } from './bits.tsx'
import { OrderPanel } from './OrderPanel.tsx'
import { previousStage } from '../lib/stages.ts'
import { Button } from './ui/button.tsx'

export function Kanban({ onReview }: { onReview: (orderId: string) => void }) {
  const desk = useDesk()
  const [history, setHistory] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const delivered = desk.orders.filter((o) => o.stage === 'delivered').length
  const [over, setOver] = useState<Stage | null>(null)
  const cancelled = desk.orders.filter((order) => order.stage === 'cancelled').toSorted(byNewest)

  useEffect(() => {
    const clear = () => setOver(null)
    window.addEventListener('dragend', clear)
    return () => window.removeEventListener('dragend', clear)
  }, [])

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-line bg-card p-0.5" role="tablist" aria-label="Board view">
          {[
            { on: !history, label: 'Active board', go: () => setHistory(false) },
            { on: history, label: `Delivered (${delivered})`, go: () => setHistory(true) },
          ].map((tab) => (
            <button
              key={tab.label}
              type="button"
              role="tab"
              aria-selected={tab.on}
              onClick={tab.go}
              className={cn('min-h-9 rounded-md px-3.5 text-sm font-medium transition-colors', tab.on ? 'bg-nav text-white' : 'text-ink-soft hover:text-ink')}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <span className="text-sm text-ink-soft">
          {history ? 'Every delivered order stays here as the record. Click a row to open it.' : 'Click a card to open the order. Drag it, or use its buttons, to move it on.'}
        </span>
      </div>
      {history ? (
        <DeliveredList onOpen={setOpenId} />
      ) : (
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
          {BOARD_STAGES.filter((stage) => stage !== 'delivered').map((stage) => {
            const cards = desk.orders.filter((order) => order.stage === stage).toSorted(byNewest)
            const value = cards.reduce((sum, order) => sum + orderTotal(order.lines), 0)
            return (
              <section
                key={stage}
                aria-label={STAGE_LABEL[stage]}
                className={cn(
                  'flex w-[18rem] shrink-0 snap-start flex-col overflow-hidden rounded-xl border bg-[#eceff3] transition-colors',
                  over === stage ? 'border-brick ring-2 ring-brick/25' : 'border-line',
                )}
                onDragOver={(event) => {
                  event.preventDefault()
                  setOver(stage)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  const id = event.dataTransfer.getData('text/plain')
                  setOver(null)
                  if (id) desk.moveOrder(id, stage)
                }}
              >
                <header className="border-t-[3px] bg-card px-3 py-2.5" style={{ borderTopColor: STAGE_COLOR[stage] }}>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STAGE_COLOR[stage] }} aria-hidden="true" />
                    <h2 className="flex-1 text-sm font-semibold">{STAGE_LABEL[stage]}</h2>
                    <span className="min-w-6 rounded-full bg-paper-deep px-1.5 text-center text-xs font-semibold text-ink tabular-nums">{cards.length}</span>
                  </div>
                  <p className="mt-0.5 pl-[18px] text-xs text-ink-soft tabular-nums">{cards.length ? rm(value) : 'No orders'}</p>
                </header>
                <ul className="flex min-h-28 flex-1 flex-col gap-2 p-2">
                  {cards.length === 0 ? (
                    <li className="rounded-lg border border-dashed border-[#c9d1dc] px-3 py-6 text-center text-xs text-ink-soft">
                      Drop an order here
                    </li>
                  ) : (
                    cards.map((order) => <Card key={order.id} order={order} onReview={onReview} onOpen={setOpenId} />)
                  )}
                </ul>
              </section>
            )
          })}
        </div>
      )}

      <details className="mt-4 rounded-2xl border border-line bg-card px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium">Cancelled ({cancelled.length}) — off the board</summary>
        {cancelled.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">No cancelled orders.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {cancelled.map((order) => (
              <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-paper px-3 py-2">
                <button type="button" className="min-w-0 text-left hover:underline" onClick={() => setOpenId(order.id)}>
                  <p className="text-sm font-medium">
                    {clientName(desk.clients, order.clientId)} <span className="font-normal text-ink-soft">{order.id}</span>
                  </p>
                  <p className="text-xs text-ink-soft">{lineSummary(order, desk.skus)}</p>
                </button>
                <Button size="sm" variant="outline" onClick={() => desk.moveOrder(order.id, 'new')}>
                  Put back in confirm
                </Button>
              </li>
            ))}
          </ul>
        )}
      </details>
      <OrderPanel orderId={openId} onClose={() => setOpenId(null)} onReview={onReview} />
    </div>
  )
}

function Card({ order, onReview, onOpen }: { order: Order; onReview: (orderId: string) => void; onOpen: (orderId: string) => void }) {
  const { clients, skus, moveOrder, hqApprove } = useDesk()
  const auth = order.stage === 'needs_approval' ? authorityFor(order, clients) : null
  const [armed, setArmed] = useState(false)
  const back = previousStage(order)

  return (
    <li
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', order.id)
        event.dataTransfer.effectAllowed = 'move'
      }}
      onClick={(event: MouseEvent) => {
        // Buttons and links inside the card do their own thing; anywhere else opens the order.
        if ((event.target as HTMLElement).closest('button, a')) return
        onOpen(order.id)
      }}
      className="group cursor-pointer rounded-lg border border-line border-l-[3px] bg-card p-3 shadow-[0_1px_2px_rgb(15_36_64/0.06)] transition-shadow hover:border-[#c3cdd9] hover:shadow-[0_4px_12px_rgb(15_36_64/0.10)] active:cursor-grabbing"
      style={{ borderLeftColor: STAGE_COLOR[order.stage] }}
    >
      <div className="flex items-center justify-between gap-2 text-[11px] text-ink-soft">
        <span className="truncate font-medium tracking-wide tabular-nums">
          {order.id}
          {order.soNumber ? ` · ${order.soNumber}` : ''}
          {order.doNumber ? ` · ${order.doNumber}` : ''}
        </span>
        <span className="shrink-0">{whenLabel(order.createdAt)}</span>
      </div>
      <h3 className="mt-1 text-sm leading-5 font-semibold">
        <button
          type="button"
          className="inline-flex max-w-full items-center gap-0.5 text-left group-hover:text-brick"
          onClick={() => onOpen(order.id)}
          aria-label={`Open order ${order.id}, ${clientName(clients, order.clientId)}`}
        >
          <span className="truncate">{clientName(clients, order.clientId)}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
        </button>
      </h3>
      <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-ink-soft">{lineSummary(order, skus)}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-paper-deep text-[10px] font-semibold text-ink" aria-hidden="true">
            {order.salesperson.slice(0, 1)}
          </span>
          {order.salesperson}
        </span>
        <span className="text-sm font-semibold tabular-nums">{rm(orderTotal(order.lines))}</span>
      </div>
      {(() => {
        const locked = lockedTotals(order)
        if (!locked) return null
        return (
          <p className="mt-0.5 text-xs text-palm">
            Locked {order.lines[0]?.lockDate}
            {locked.complete ? ` · cost ${rm(locked.cost)} · GP ${rm(locked.gp)}` : ' · cost missing on some lines'}
          </p>
        )
      })()}
      {order.stage === 'needs_approval' && order.hold ? (
        <div className="mt-1 space-y-1">
          <HoldPill status={order.hold.status} />
          {auth ? (
            <p className="text-xs leading-5 text-amber">
              {auth.reason}
              {order.hold.status === 'hq' && !auth.within ? ' — outside HQ authority, escalate' : ''}
            </p>
          ) : null}
          {order.hold.status === 'rejected' ? <p className="text-xs leading-5 text-rose">Boss: {order.hold.rejectReason}</p> : null}
        </div>
      ) : null}
      {order.hold?.status === 'approved' && order.stage !== 'needs_approval' ? (
        <p className="mt-1 text-xs text-palm">Credit hold approved by {order.hold.decidedBy}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-2.5">
        {order.stage === 'new' ? (
          <Button size="sm" onClick={() => onReview(order.id)}>
            Open to check
          </Button>
        ) : null}
        {order.stage === 'new' ? (
          <Button size="sm" variant="outline" onClick={() => moveOrder(order.id, 'confirmed')}>
            Send on
          </Button>
        ) : null}
        {order.stage === 'needs_approval' && order.hold?.status === 'hq' ? (
          <Button size="sm" disabled={!auth?.within} onClick={() => hqApprove(order.id)}>
            HQ Approve
          </Button>
        ) : null}
        {order.stage === 'needs_approval' ? (
          <Button size="sm" variant="outline" asChild>
            <a href="#hold">{order.hold?.status === 'hq' ? 'Open HQ Hold' : 'Open in HQ Hold'}</a>
          </Button>
        ) : null}
        {order.stage === 'confirmed' ? (
          <Button size="sm" onClick={() => openDocument(order.id)}>
            Open SO
          </Button>
        ) : null}
        {order.stage === 'confirmed' ? (
          <Button size="sm" variant="outline" onClick={() => moveOrder(order.id, 'preparing')}>
            Start preparing
          </Button>
        ) : null}
        {order.stage === 'preparing' ? (
          <Button size="sm" onClick={() => openDocument(order.id)}>
            Open D/O
          </Button>
        ) : null}
        {order.stage === 'preparing' ? (
          <Button size="sm" variant="outline" onClick={() => moveOrder(order.id, 'delivered')}>
            Mark delivered
          </Button>
        ) : null}
        {order.stage === 'delivered' ? (
          <Button size="sm" variant="outline" onClick={() => openDocument(order.id)}>
            View D/O
          </Button>
        ) : null}
        {back ? (
          <Button size="sm" variant="ghost" onClick={() => moveOrder(order.id, back.stage)}>
            {back.label}
          </Button>
        ) : null}
        {armed ? (
          <>
            <Button size="sm" variant="danger" onClick={() => moveOrder(order.id, 'cancelled')}>
              Yes, cancel
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setArmed(false)}>
              Keep
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setArmed(true)}>
            Cancel
          </Button>
        )}
      </div>
    </li>
  )
}

function byNewest(a: Order, b: Order): number {
  if (a.createdAt === b.createdAt) return 0
  return a.createdAt < b.createdAt ? 1 : -1
}

type Period = 'all' | 'month' | 'last' | '7'
type PayFilter = 'all' | 'unpaid' | 'paid'
type Sort = 'new' | 'old' | 'value'

const deliveredOn = (order: Order): string => order.invoicedAt ?? (order.doCreatedAt ?? order.createdAt).slice(0, 10)
const shortDate = (iso: string): string => new Date(`${iso}T00:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })

function inPeriod(iso: string, period: Period): boolean {
  if (period === 'all') return true
  const now = new Date()
  const day = new Date(`${iso}T00:00:00`)
  if (period === '7') return now.getTime() - day.getTime() <= 7 * 86_400_000
  const month = period === 'month' ? now.getMonth() : (now.getMonth() + 11) % 12
  const year = period === 'last' && now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  return day.getMonth() === month && day.getFullYear() === year
}

/** Delivered orders as an ERP list view: summary, one filter row, sortable table (cards on a phone). */
function DeliveredList({ onOpen }: { onOpen: (orderId: string) => void }) {
  const { orders, clients, skus } = useDesk()
  const all = useMemo(() => orders.filter((o) => o.stage === 'delivered'), [orders])
  const [query, setQuery] = useState('')
  const [person, setPerson] = useState('')
  const [client, setClient] = useState('')
  const [period, setPeriod] = useState<Period>('all')
  const [pay, setPay] = useState<PayFilter>('all')
  const [sort, setSort] = useState<Sort>('new')
  const [limit, setLimit] = useState(20)
  const people = [...new Set(all.map((o) => o.salesperson))].toSorted()
  const buyers = [...new Set(all.map((o) => o.clientId ?? ''))].map((id) => ({ id, name: clientName(clients, id || null) })).toSorted((a, b) => a.name.localeCompare(b.name))
  const q = query.trim().toLowerCase()
  const rows = all
    .filter(
      (o) =>
        (!q || `${o.id} ${o.soNumber ?? ''} ${o.doNumber ?? ''} ${o.salesperson} ${clientName(clients, o.clientId)} ${lineSummary(o, skus)}`.toLowerCase().includes(q)) &&
        (!person || o.salesperson === person) &&
        (!client || (o.clientId ?? '') === client) &&
        inPeriod(deliveredOn(o), period) &&
        (pay === 'all' || (pay === 'paid' ? Boolean(o.paidAt) : !o.paidAt)),
    )
    .toSorted((a, b) => (sort === 'value' ? orderTotal(b.lines) - orderTotal(a.lines) : sort === 'old' ? deliveredOn(a).localeCompare(deliveredOn(b)) : deliveredOn(b).localeCompare(deliveredOn(a))))
  const value = rows.reduce((sum, o) => sum + orderTotal(o.lines), 0)
  const unpaid = rows.filter((o) => !o.paidAt)
  const unpaidValue = unpaid.reduce((sum, o) => sum + orderTotal(o.lines), 0)
  const filtered = Boolean(q || person || client || period !== 'all' || pay !== 'all')
  const select = 'h-10 rounded-lg border border-line bg-card px-3 text-sm text-ink'

  return (
    <section className="space-y-3" aria-label="Delivered orders">
      <dl className="grid grid-cols-3 gap-2">
        {[
          ['Orders', String(rows.length)],
          ['Value', rm(value)],
          ['Not paid yet', `${unpaid.length} · ${rm(unpaidValue)}`],
        ].map(([label, figure]) => (
          <div key={label} className="rounded-lg border border-line bg-card px-3 py-2.5">
            <dt className="text-xs text-ink-soft">{label}</dt>
            <dd className="mt-0.5 truncate text-base font-semibold tabular-nums sm:text-lg">{figure}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-card p-2">
        <label className="relative min-w-[14rem] flex-1">
          <span className="sr-only">Search delivered orders</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden="true" />
          <input
            placeholder="Customer, order, SO, DO or item"
            className="h-10 w-full rounded-lg border border-line bg-card pr-3 pl-9 text-sm"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setLimit(20)
            }}
          />
        </label>
        <select aria-label="Salesperson" className={select} value={person} onChange={(e) => setPerson(e.target.value)}>
          <option value="">All salespeople</option>
          {people.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <select aria-label="Customer" className={cn(select, 'max-w-[12rem]')} value={client} onChange={(e) => setClient(e.target.value)}>
          <option value="">All customers</option>
          {buyers.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select aria-label="Delivered when" className={select} value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
          <option value="all">Any date</option>
          <option value="7">Last 7 days</option>
          <option value="month">This month</option>
          <option value="last">Last month</option>
        </select>
        <select aria-label="Payment" className={select} value={pay} onChange={(e) => setPay(e.target.value as PayFilter)}>
          <option value="all">Paid or not</option>
          <option value="unpaid">Not paid yet</option>
          <option value="paid">Paid</option>
        </select>
        <select aria-label="Sort" className={select} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="new">Newest first</option>
          <option value="old">Oldest first</option>
          <option value="value">Biggest first</option>
        </select>
        {filtered ? (
          <Button
            variant="ghost"
            onClick={() => {
              setQuery('')
              setPerson('')
              setClient('')
              setPeriod('all')
              setPay('all')
            }}
          >
            Clear filters
          </Button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line bg-card px-4 py-10 text-center text-sm text-ink-soft">No delivered orders match these filters.</p>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border border-line bg-card md:block">
            <table className="w-full text-sm">
              <thead className="bg-[#f6f8fa] text-left text-xs text-ink-soft">
                <tr className="border-b border-line">
                  <th className="px-4 py-2.5 font-medium">Delivered</th>
                  <th className="px-3 py-2.5 font-medium">Order · SO · D/O</th>
                  <th className="px-3 py-2.5 font-medium">Customer</th>
                  <th className="px-3 py-2.5 font-medium">Salesperson</th>
                  <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-4 py-2.5 font-medium">Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.slice(0, limit).map((o) => (
                  <tr key={o.id} className="cursor-pointer hover:bg-[#f3f7fb]" onClick={() => onOpen(o.id)}>
                    <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">{shortDate(deliveredOn(o))}</td>
                    <td className="px-3 py-2.5 text-xs text-ink-soft tabular-nums">
                      <button type="button" className="font-medium text-brick hover:underline" onClick={() => onOpen(o.id)}>
                        {o.id}
                      </button>
                      <span className="block">{[o.soNumber, o.doNumber].filter(Boolean).join(' · ') || '—'}</span>
                    </td>
                    <td className="max-w-72 px-3 py-2.5">
                      <span className="block truncate font-medium">{clientName(clients, o.clientId)}</span>
                      <span className="block truncate text-xs text-ink-soft">{lineSummary(o, skus)}</span>
                    </td>
                    <td className="px-3 py-2.5">{o.salesperson}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{rm(orderTotal(o.lines))}</td>
                    <td className="px-4 py-2.5">
                      <PaidPill order={o} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 md:hidden">
            {rows.slice(0, limit).map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => onOpen(o.id)} className="w-full rounded-lg border border-line border-l-[3px] bg-card p-3 text-left" style={{ borderLeftColor: STAGE_COLOR.delivered }}>
                  <span className="flex justify-between gap-2 text-xs text-ink-soft tabular-nums">
                    <span>{o.id}{o.doNumber ? ` · ${o.doNumber}` : ''}</span>
                    <span>{shortDate(deliveredOn(o))}</span>
                  </span>
                  <span className="mt-1 block font-semibold">{clientName(clients, o.clientId)}</span>
                  <span className="mt-1 flex items-center justify-between gap-2 text-sm">
                    <span className="text-ink-soft">{o.salesperson}</span>
                    <span className="font-semibold tabular-nums">{rm(orderTotal(o.lines))}</span>
                  </span>
                  <span className="mt-1.5 block">
                    <PaidPill order={o} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-2 text-sm text-ink-soft">
            <span>
              Showing {Math.min(limit, rows.length)} of {rows.length}
            </span>
            {rows.length > limit ? (
              <Button variant="outline" onClick={() => setLimit(limit + 20)}>
                Show 20 more
              </Button>
            ) : null}
          </div>
        </>
      )}
    </section>
  )
}

function PaidPill({ order }: { order: Order }) {
  return order.paidAt ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800">
      <span className="h-1.5 w-1.5 rounded-full bg-green-600" aria-hidden="true" />
      Paid {shortDate(order.paidAt.slice(0, 10))}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
      Not paid yet
    </span>
  )
}
