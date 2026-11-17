import { useMemo, useState } from 'react'
import { rm, qty, whenLabel } from '../lib/format.ts'
import type { StockRow } from '../lib/inventory.ts'
import type { PoStatus, PurchaseOrder } from '../lib/types.ts'
import { useDesk } from '../lib/useDesk.ts'
import { cn } from '../lib/utils.ts'
import { Button } from './ui/button.tsx'
import { Input } from './ui/input.tsx'

const STATUS: Record<PoStatus, { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'bg-sand text-ink' },
  sent: { label: 'Sent · waiting', tone: 'bg-brick/10 text-brick' },
  partial: { label: 'Part received', tone: 'bg-amber/15 text-amber' },
  received: { label: 'Received', tone: 'bg-ok-soft text-ok' },
  cancelled: { label: 'Cancelled', tone: 'bg-sand text-ink-soft' },
}

// Re-stock list (free + on order at or under the re-order level) → purchase order drafts, one per supplier →
// sent → goods received at the yard (part or full), which adds stock and moves the average cost.
export function StockRestock({ rows }: { rows: StockRow[] }) {
  const { purchaseOrders, createPurchaseOrders } = useDesk()
  const drafted = new Set(purchaseOrders.filter((po) => po.status === 'draft').flatMap((po) => po.lines.map((line) => line.code)))
  const waiting = rows.filter((row) => row.needsRestock && drafted.has(row.item.code)).length
  const due = rows.filter((row) => row.needsRestock && !drafted.has(row.item.code)).toSorted((a, b) => a.item.supplier.localeCompare(b.item.supplier))
  const [want, setWant] = useState<Record<string, string>>({})
  const [picked, setPicked] = useState<string[]>(() => due.map((row) => row.item.code))
  const [showDone, setShowDone] = useState(false)
  const qtyOf = (row: StockRow) => Number(want[row.item.code] ?? row.suggestQty) || 0
  const chosen = due.filter((row) => picked.includes(row.item.code) && qtyOf(row) > 0)
  const suppliers = new Set(chosen.map((row) => row.item.supplier))
  const total = chosen.reduce((sum, row) => sum + qtyOf(row) * row.item.avgCost, 0)
  const live = purchaseOrders.filter((po) => po.status !== 'received' && po.status !== 'cancelled')
  const done = purchaseOrders.filter((po) => po.status === 'received' || po.status === 'cancelled')

  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
      <section className="min-w-0 rounded-2xl border border-line bg-card p-4" aria-labelledby="restock-heading">
        <h2 id="restock-heading" className="font-display text-lg">
          Need re-stock
        </h2>
        <p className="text-sm text-ink-soft">Free stock plus what is already on order, at or under the re-order level. The suggested quantity tops it back up; change it if you like.</p>
        {waiting > 0 ? (
          <p className="mt-2 rounded-lg bg-amber/10 px-3 py-2 text-xs text-amber">
            {waiting} more item{waiting === 1 ? ' is' : 's are'} already on a draft PO — send {waiting === 1 ? 'it' : 'them'} on the right.
          </p>
        ) : null}
        {due.length === 0 ? (
          <p className="mt-3 rounded-xl bg-ok-soft px-3 py-2 text-sm text-ok">{waiting > 0 ? 'Everything else is covered.' : 'Nothing under its re-order level. Good.'}</p>
        ) : (
          <>
            <ul className="mt-3 divide-y divide-line">
              {due.map((row, i) => {
                const on = picked.includes(row.item.code)
                const head = i === 0 || due[i - 1].item.supplier !== row.item.supplier
                return (
                  <li key={row.item.code} className="py-2">
                    {head ? <p className="pb-1 text-xs font-semibold tracking-wide text-ink-soft uppercase">{row.item.supplier}</p> : null}
                    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3">
                      <input
                        type="checkbox"
                        aria-label={`Order ${row.product?.name ?? row.item.code}`}
                        className="h-4 w-4 accent-brick"
                        checked={on}
                        onChange={() => setPicked(on ? picked.filter((c) => c !== row.item.code) : [...picked, row.item.code])}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{row.product?.name ?? row.item.code}</span>
                        <span className="block text-xs text-ink-soft tabular-nums">
                          Free {qty(row.available)}
                          {row.onOrder ? ` + ${qty(row.onOrder)} on order` : ''} · re-order at {qty(row.item.reorderAt)} · {row.item.leadDays} days
                        </span>
                      </span>
                      <label className="flex items-center gap-1 text-xs text-ink-soft">
                        <span className="sr-only">Order quantity</span>
                        <Input
                          className="h-9 w-24 text-right tabular-nums"
                          inputMode="decimal"
                          value={want[row.item.code] ?? String(row.suggestQty)}
                          onChange={(e) => setWant({ ...want, [row.item.code]: e.target.value.replace(/[^\d.]/g, '') })}
                        />
                        {row.product?.uom}
                      </label>
                    </div>
                  </li>
                )
              })}
            </ul>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
              <p className="text-sm text-ink-soft">
                {chosen.length} item{chosen.length === 1 ? '' : 's'} · {suppliers.size} supplier{suppliers.size === 1 ? '' : 's'} · about <span className="font-medium text-ink tabular-nums">{rm(total)}</span> at average cost
              </p>
              <Button
                type="button"
                disabled={chosen.length === 0}
                onClick={() => {
                  createPurchaseOrders(chosen.map((row) => ({ code: row.item.code, qty: qtyOf(row) })))
                  setPicked([])
                }}
              >
                Make {suppliers.size || ''} PO draft{suppliers.size === 1 ? '' : 's'}
              </Button>
            </div>
          </>
        )}
      </section>

      <section className="min-w-0 rounded-2xl border border-line bg-card p-4" aria-labelledby="po-heading">
        <h2 id="po-heading" className="font-display text-lg">
          Purchase orders
        </h2>
        <p className="text-sm text-ink-soft">Draft → sent to supplier → goods in at the yard. Sent orders count as “on order” so the same item is not ordered twice.</p>
        <div className="mt-3 space-y-3">
          {live.length === 0 ? <p className="text-sm text-ink-soft">No open purchase orders.</p> : null}
          {live.map((po) => (
            <PoCard key={po.id} po={po} />
          ))}
        </div>
        {done.length > 0 ? (
          <div className="mt-4 border-t border-line pt-3">
            <button type="button" className="min-h-9 text-sm font-medium text-brick" onClick={() => setShowDone(!showDone)}>
              {showDone ? 'Hide' : 'Show'} {done.length} closed
            </button>
            {showDone ? (
              <div className="mt-2 space-y-3">
                {done.map((po) => (
                  <PoCard key={po.id} po={po} />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  )
}

function PoCard({ po }: { po: PurchaseOrder }) {
  const { products, setPurchaseStatus, setPurchaseLine, receivePO } = useDesk()
  const names = useMemo(() => new Map(products.map((p) => [p.code, p])), [products])
  const [receiving, setReceiving] = useState(false)
  const [got, setGot] = useState<Record<string, string>>({})
  const value = po.lines.reduce((sum, line) => sum + line.qty * line.cost, 0)
  const canReceive = po.status === 'sent' || po.status === 'partial'

  return (
    <article className="rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          {po.id} <span className="font-normal text-ink-soft">· {po.supplier}</span>
        </p>
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS[po.status].tone)}>{STATUS[po.status].label}</span>
      </div>
      <p className="text-xs text-ink-soft">
        Made {whenLabel(po.createdAt)} · expected {new Date(`${po.expected}T00:00:00`).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' })} · {rm(value)}
        {po.note ? ` · ${po.note}` : ''}
      </p>
      <ul className="mt-2 divide-y divide-line text-sm">
        {po.lines.map((line) => {
          const p = names.get(line.code)
          const left = Math.max(0, line.qty - line.received)
          return (
            <li key={line.code} className="flex items-center justify-between gap-2 py-1.5">
              <span className="min-w-0 truncate">{p?.name ?? line.code}</span>
              {po.status === 'draft' ? (
                <Input
                  aria-label={`Quantity for ${p?.name ?? line.code}`}
                  key={`${line.code}-${line.qty}`}
                  className="h-9 w-24 text-right tabular-nums"
                  inputMode="decimal"
                  defaultValue={line.qty}
                  onBlur={(e) => Number(e.target.value) !== line.qty && setPurchaseLine(po.id, line.code, Number(e.target.value) || 0)}
                />
              ) : receiving && left > 0 ? (
                <label className="flex items-center gap-1 text-xs text-ink-soft">
                  got
                  <Input
                    className="h-9 w-20 text-right tabular-nums"
                    inputMode="decimal"
                    value={got[line.code] ?? String(left)}
                    onChange={(e) => setGot({ ...got, [line.code]: e.target.value.replace(/[^\d.]/g, '') })}
                  />
                  / {qty(left)}
                </label>
              ) : (
                <span className="shrink-0 text-xs tabular-nums">
                  {qty(line.received)} / {qty(line.qty)} {p?.uom}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      <div className="mt-2 flex flex-wrap gap-2">
        {po.status === 'draft' ? (
          <>
            <Button type="button" size="sm" onClick={() => setPurchaseStatus(po.id, 'sent')}>
              Mark sent to supplier
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setPurchaseStatus(po.id, 'cancelled')}>
              Cancel
            </Button>
          </>
        ) : null}
        {canReceive && !receiving ? (
          <Button type="button" size="sm" onClick={() => setReceiving(true)}>
            Goods arrived
          </Button>
        ) : null}
        {receiving ? (
          <>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                const map: Record<string, number> = {}
                for (const line of po.lines) map[line.code] = Number(got[line.code] ?? Math.max(0, line.qty - line.received)) || 0
                receivePO(po.id, map)
                setReceiving(false)
                setGot({})
              }}
            >
              Book goods in
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setReceiving(false)}>
              Back
            </Button>
          </>
        ) : null}
      </div>
    </article>
  )
}
