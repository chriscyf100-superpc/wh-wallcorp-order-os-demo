import * as Dialog from '@radix-ui/react-dialog'
import { Check, X } from 'lucide-react'
import { useState } from 'react'
import { rm, trimQty, unitWord, whenLabel } from '../lib/format.ts'
import { authorityFor } from '../lib/hold.ts'
import { STAGE_COLOR, STAGE_LABEL } from '../lib/labels.ts'
import { clientName, findSku } from '../lib/orders.ts'
import { lockedTotals } from '../lib/pricedesk.ts'
import { orderTotal } from '../lib/pricing.ts'
import { openDocument } from '../lib/useView.ts'
import { useDesk, type OrderMeta } from '../lib/useDesk.ts'
import type { Order, Stage } from '../lib/types.ts'
import { cn } from '../lib/utils.ts'
import { HoldPill, StagePill } from './bits.tsx'
import { ConfirmCard } from './ConfirmQueue.tsx'
import { previousStage } from '../lib/stages.ts'
import { Button } from './ui/button.tsx'
import { Input } from './ui/input.tsx'

/*
 * One order, opened from a board card or the delivered list (ERP "record" view).
 * What can change depends on the stage, and follows the locked rules:
 *  - New: everything (customer, zone, lines, prices) — the same editor as the Confirm queue.
 *  - HQ Hold (with HQ) / Confirmed without a hold: lines are locked to the SO; "Change items" sends the order back
 *    to Confirm, which unlocks prices and runs the credit check again when it is re-confirmed.
 *  - Approved holds are audited, so their lines cannot be reopened here — cancel and re-raise instead.
 *  - Preparing: the D/O exists; step back to Confirmed first.
 *  - Delivered / cancelled: read only.
 */
export function OrderPanel({ orderId, onClose, onReview }: { orderId: string | null; onClose: () => void; onReview?: (id: string) => void }) {
  const desk = useDesk()
  const order = desk.orders.find((row) => row.id === orderId) ?? null
  return (
    <Dialog.Root open={Boolean(order)} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40 data-[state=open]:animate-[fade-in_150ms_ease-out]" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-[min(100%,46rem)] flex-col border-l border-line bg-paper shadow-2xl focus:outline-none data-[state=open]:animate-[sheet-in_200ms_ease-out]">
          {order ? <Body order={order} onClose={onClose} onReview={onReview} /> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Body({ order, onClose, onReview }: { order: Order; onClose: () => void; onReview?: (id: string) => void }) {
  const { clients, moveOrder, hqApprove } = useDesk()
  const [armed, setArmed] = useState<'cancel' | 'revise' | null>(null)
  const auth = order.stage === 'needs_approval' ? authorityFor(order, clients) : null
  const back = previousStage(order)
  const canRevise = (order.stage === 'confirmed' && !order.hold) || (order.stage === 'needs_approval' && order.hold?.status === 'hq')
  const live = order.stage !== 'delivered' && order.stage !== 'cancelled'

  return (
    <>
      <header className="border-b border-line bg-card px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-ink-soft tabular-nums">
              {order.id}
              {order.soNumber ? ` · ${order.soNumber}` : ''}
              {order.doNumber ? ` · ${order.doNumber}` : ''}
            </p>
            <Dialog.Title className="mt-0.5 truncate font-display text-xl text-ink">{clientName(clients, order.clientId)}</Dialog.Title>
            <Dialog.Description className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
              <StagePill stage={order.stage} />
              <span>
                {order.salesperson} · taken {whenLabel(order.createdAt)}
              </span>
            </Dialog.Description>
          </div>
          <Dialog.Close className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-sand" aria-label="Close order">
            <X className="h-4 w-4" />
          </Dialog.Close>
        </div>
        <Stepper order={order} />
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {order.stage === 'new' ? (
          <>
            <p className="mb-3 rounded-lg bg-sand px-3 py-2 text-sm text-ink">Not raised yet — everything on this order can still change.</p>
            <ConfirmCard order={order} fresh={false} />
          </>
        ) : (
          <div className="space-y-4">
            <EditNote order={order} />
            {order.stage === 'needs_approval' && order.hold ? (
              <section className="rounded-lg border border-amber/30 bg-amber-soft px-4 py-3 text-sm text-amber">
                <HoldPill status={order.hold.status} />
                {auth ? <p className="mt-1 leading-6">{auth.reason}</p> : null}
                {order.hold.status === 'rejected' ? <p className="mt-1 leading-6 text-rose">Boss: {order.hold.rejectReason}</p> : null}
              </section>
            ) : null}
            <Lines order={order} />
            <Details order={order} editable={live && order.stage !== 'preparing'} />
            <details className="rounded-lg border border-line bg-card px-4 py-3">
              <summary className="text-sm font-medium">Original message</summary>
              <p className="mt-2 text-sm leading-6 whitespace-pre-wrap text-ink-soft">{order.rawMessage}</p>
            </details>
          </div>
        )}
      </div>

      {order.stage !== 'new' ? (
        <footer className="flex flex-wrap items-center gap-2 border-t border-line bg-card px-5 py-3">
          {armed === 'revise' ? (
            <>
              <p className="w-full text-sm text-ink">
                Send {order.id} back to Confirm? Its SO prices unlock and the credit check runs again when it is re-confirmed.
              </p>
              <Button
                onClick={() => {
                  moveOrder(order.id, 'new')
                  setArmed(null)
                }}
              >
                Yes, change items
              </Button>
              <Button variant="ghost" onClick={() => setArmed(null)}>
                Keep as is
              </Button>
            </>
          ) : armed === 'cancel' ? (
            <>
              <p className="w-full text-sm text-ink">Cancel {order.id}? It leaves the board; you can put it back in Confirm later.</p>
              <Button variant="danger" onClick={() => { moveOrder(order.id, 'cancelled'); onClose() }}>
                Yes, cancel order
              </Button>
              <Button variant="ghost" onClick={() => setArmed(null)}>
                Keep
              </Button>
            </>
          ) : (
            <>
              {order.stage === 'needs_approval' && order.hold?.status === 'hq' ? (
                <Button disabled={!auth?.within} onClick={() => hqApprove(order.id)}>
                  HQ Approve
                </Button>
              ) : null}
              {order.stage === 'needs_approval' ? (
                <Button variant="outline" asChild>
                  <a href="#hold" onClick={onClose}>Open HQ Hold</a>
                </Button>
              ) : null}
              {order.stage === 'confirmed' ? <Button onClick={() => moveOrder(order.id, 'preparing')}>Start preparing</Button> : null}
              {order.stage === 'preparing' ? <Button onClick={() => moveOrder(order.id, 'delivered')}>Mark delivered</Button> : null}
              {order.stage === 'confirmed' || order.stage === 'preparing' || order.stage === 'delivered' ? (
                <Button variant="outline" onClick={() => openDocument(order.id)}>
                  {order.stage === 'confirmed' ? 'Open SO' : 'Open D/O'}
                </Button>
              ) : null}
              {canRevise ? (
                <Button variant="outline" onClick={() => setArmed('revise')}>
                  Change items
                </Button>
              ) : null}
              {order.stage === 'cancelled' ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    moveOrder(order.id, 'new')
                    onReview?.(order.id)
                  }}
                >
                  Put back in Confirm
                </Button>
              ) : null}
              <span className="flex-1" />
              {back && order.stage !== 'needs_approval' ? (
                <Button variant="ghost" onClick={() => moveOrder(order.id, back.stage)}>
                  {back.stage === 'new' ? 'Back to Confirm' : `Back to ${STAGE_LABEL[back.stage]}`}
                </Button>
              ) : null}
              {live ? (
                <Button variant="ghost" className="text-rose hover:text-rose" onClick={() => setArmed('cancel')}>
                  Cancel order
                </Button>
              ) : null}
            </>
          )}
        </footer>
      ) : null}
    </>
  )
}

const FLOW: Stage[] = ['new', 'needs_approval', 'confirmed', 'preparing', 'delivered']

/** Where the order is in the flow. HQ Hold only shows when this order went through it. */
function Stepper({ order }: { order: Order }) {
  if (order.stage === 'cancelled') return <p className="mt-3 text-xs font-medium text-ink-soft">Cancelled — off the board.</p>
  const steps = FLOW.filter((stage) => stage !== 'needs_approval' || order.hold || order.stage === 'needs_approval')
  const at = steps.indexOf(order.stage)
  return (
    <ol className="mt-3 flex items-center gap-1" aria-label="Order progress">
      {steps.map((stage, i) => {
        const done = i < at
        const now = i === at
        return (
          <li key={stage} className="flex min-w-0 flex-1 items-center gap-1.5" aria-current={now ? 'step' : undefined}>
            <span
              className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white', !done && !now && 'bg-paper-deep text-ink-soft')}
              style={done || now ? { background: STAGE_COLOR[stage] } : undefined}
            >
              {done ? <Check className="h-3 w-3" aria-hidden="true" /> : i + 1}
            </span>
            <span className={cn('truncate text-xs', now ? 'font-semibold text-ink' : 'text-ink-soft')}>{STAGE_LABEL[stage]}</span>
            {i < steps.length - 1 ? <span className={cn('h-px min-w-3 flex-1', done ? 'bg-ink-soft/50' : 'bg-line')} aria-hidden="true" /> : null}
          </li>
        )
      })}
    </ol>
  )
}

function EditNote({ order }: { order: Order }) {
  const text =
    order.stage === 'needs_approval'
      ? order.hold?.status === 'hq'
        ? 'Waiting for HQ. To change items, use “Change items” — the order goes back to Confirm and is checked again.'
        : 'With the boss or decided. Items cannot change here; cancel and re-raise if the order is wrong.'
      : order.stage === 'confirmed'
        ? order.hold
          ? 'Approved through HQ Hold (audited), so the items are locked. Delivery details can still change.'
          : 'Sales order raised at locked prices. Delivery details can change here; “Change items” reopens the lines.'
        : order.stage === 'preparing'
          ? 'The D/O is made. To change anything, step back to Confirmed first.'
          : order.stage === 'delivered'
            ? 'Delivered — kept as the record. Use a credit note in EMAS for returns.'
            : 'Cancelled orders can be put back in Confirm.'
  return <p className="rounded-lg bg-sand px-3 py-2 text-sm text-ink">{text}</p>
}

function Lines({ order }: { order: Order }) {
  const { skus } = useDesk()
  const locked = lockedTotals(order)
  const total = orderTotal(order.lines)
  return (
    <section className="rounded-lg border border-line bg-card">
      <h3 className="border-b border-line px-4 py-2.5 text-sm font-semibold">Items</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm">
          <thead className="text-left text-xs text-ink-soft">
            <tr className="border-b border-line">
              <th className="px-4 py-2 font-medium">Item</th>
              <th className="px-2 py-2 text-right font-medium">Qty</th>
              <th className="px-2 py-2 text-right font-medium">RM each</th>
              <th className="px-4 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {order.lines.map((line) => {
              const sku = findSku(skus, line.skuId)
              return (
                <tr key={line.id}>
                  <td className="px-4 py-2">
                    <span className="block font-medium">{sku?.name ?? line.skuId}</span>
                    {sku?.nameZh ? <span className="block text-xs text-ink-soft">{sku.nameZh}</span> : null}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {trimQty(line.qty)} {sku ? unitWord(sku.unit, line.qty) : ''}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{rm(line.unitPrice)}</td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">{rm(line.qty * line.unitPrice)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-line">
              <td className="px-4 py-2.5 text-xs text-ink-soft" colSpan={3}>
                {locked ? `Locked ${order.lines[0]?.lockDate}${locked.complete ? ` · cost ${rm(locked.cost)} · GP ${rm(locked.gp)}` : ' · cost missing on some lines'}` : 'Total'}
              </td>
              <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{rm(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

const FIELDS: { key: keyof OrderMeta; label: string; type?: string }[] = [
  { key: 'poNumber', label: 'Customer PO no.' },
  { key: 'term', label: 'Term' },
  { key: 'deliveryDate', label: 'Delivery date' },
  { key: 'contactTel', label: 'Site contact tel', type: 'tel' },
  { key: 'deliverySite', label: 'Delivery site' },
]

function Details({ order, editable }: { order: Order; editable: boolean }) {
  const { setOrderMeta } = useDesk()
  return (
    <section className="rounded-lg border border-line bg-card px-4 py-3">
      <h3 className="text-sm font-semibold">Delivery details</h3>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <label key={field.key} className={cn('text-xs font-medium text-ink-soft', field.key === 'deliverySite' && 'sm:col-span-2')}>
            {field.label}
            {editable ? (
              <Input
                key={`${order.id}-${field.key}-${order[field.key] ?? ''}`}
                type={field.type ?? 'text'}
                className="mt-1 font-normal"
                defaultValue={order[field.key] ?? ''}
                onBlur={(event) => {
                  const value = event.target.value.trim()
                  if (value !== (order[field.key] ?? '')) setOrderMeta(order.id, { [field.key]: value || undefined })
                }}
              />
            ) : (
              <span className="mt-1 block text-sm font-normal text-ink">{order[field.key] || '—'}</span>
            )}
          </label>
        ))}
      </div>
      {editable ? <p className="mt-2 text-xs text-ink-soft">Saved when you leave a field.</p> : null}
    </section>
  )
}
