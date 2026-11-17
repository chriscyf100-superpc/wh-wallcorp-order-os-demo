import { ShieldAlert, Smartphone } from 'lucide-react'
import { useMemo, useState } from 'react'
import { rm } from '../lib/format.ts'
import { AuthorityMeter } from './meters.tsx'
import { assessAuthority, authorityFor, BOSS_NAME, HQ_AUTHORITY } from '../lib/hold.ts'
import { clientName, findClient, lineSummary } from '../lib/orders.ts'
import { orderTotal } from '../lib/pricing.ts'
import type { Order } from '../lib/types.ts'
import { useDesk } from '../lib/useDesk.ts'
import { cn } from '../lib/utils.ts'
import { HoldPill, Note } from './bits.tsx'
import { Button } from './ui/button.tsx'
import { Modal } from './ui/dialog.tsx'

export function Hold() {
  const desk = useDesk()
  const [picked, setPicked] = useState<string[]>([])
  const [bossOpen, setBossOpen] = useState(false)

  const held = useMemo(
    () => desk.orders.filter((order) => order.stage === 'needs_approval' && order.hold).toSorted(byNewest),
    [desk.orders],
  )
  const withHq = held.filter((order) => order.hold?.status === 'hq')
  const withBoss = held.filter((order) => order.hold?.status === 'escalated')
  const rejected = held.filter((order) => order.hold?.status === 'rejected')
  const outside = withHq.filter((order) => !authorityFor(order, desk.clients).within)
  const selected = picked.filter((id) => withHq.some((order) => order.id === id))

  const toggle = (id: string) => setPicked((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]))

  const sendToBoss = () => {
    desk.escalate(selected)
    setPicked([])
    setBossOpen(true)
  }

  return (
    <div className="space-y-5">
      <Note>
        <strong>HQ authority (demo caps):</strong> up to {rm(HQ_AUTHORITY.maxOverRm)} over the limit and{' '}
        {HQ_AUTHORITY.maxAgingMonths} months overdue. Whitelisted customers: {rm(HQ_AUTHORITY.whitelistMaxOverRm)} and{' '}
        {HQ_AUTHORITY.whitelistMaxAgingMonths} months. Anything beyond that must go to {BOSS_NAME}. Every HQ approval
        emails the boss (demo — nothing is sent) and is written to the audit log.
      </Note>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink-soft">
          {withHq.length} with HQ · {outside.length} outside authority · {withBoss.length} with boss · {rejected.length}{' '}
          rejected
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={outside.length === 0}
            onClick={() => setPicked(outside.map((order) => order.id))}
          >
            Select all outside authority ({outside.length})
          </Button>
          <Button size="sm" disabled={selected.length === 0} onClick={sendToBoss}>
            <ShieldAlert className="h-4 w-4" />
            Escalate selected to boss ({selected.length})
          </Button>
          <Button variant="outline" size="sm" onClick={() => setBossOpen(true)}>
            <Smartphone className="h-4 w-4" />
            Boss phone ({withBoss.length})
          </Button>
        </div>
      </div>

      {held.length === 0 ? (
        <p className="rounded-2xl border border-line bg-card px-4 py-6 text-sm text-ink-soft">
          Nothing on hold. A credit or overdue stop from Confirm will land here.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
          {held.filter(order => order.hold?.status !== 'rejected').map((order) => (
            <HoldRow
              key={order.id}
              order={order}
              checked={selected.includes(order.id)}
              onToggle={() => toggle(order.id)}
              onBoss={() => setBossOpen(true)}
            />
          ))}
        </ul>
      )}

      <section className="rounded-2xl border border-amber/30 bg-card p-4">
        <h2 className="text-xl font-semibold">Pending payment · 待收款 ({rejected.length})</h2>
        <p className="my-2 text-sm text-ink-soft">Original requests stay here with the rejection reason. Confirm the payment in Payments in, then HQ rechecks credit including open SOs. No WhatsApp re-entry needed.</p>
        {!rejected.length && <p className="text-sm text-ink-soft">No rejected requests awaiting payment.</p>}
        <ul>{rejected.map(order => <HoldRow key={order.id} order={order} checked={false} onToggle={() => {}} onBoss={() => setBossOpen(true)} />)}</ul>
      </section>
      <Modal
        open={bossOpen}
        onOpenChange={setBossOpen}
        title="Boss phone"
        description="Simulated WhatsApp on the boss's phone. Nothing is sent anywhere."
      >
        <BossPhone />
      </Modal>
    </div>
  )
}

function HoldRow({
  order,
  checked,
  onToggle,
  onBoss,
}: {
  order: Order
  checked: boolean
  onToggle: () => void
  onBoss: () => void
}) {
  const desk = useDesk()
  const [reason, setReason] = useState('')
  const hold = order.hold
  const auth = authorityFor(order, desk.clients)
  if (!hold) return null
  const pickable = hold.status === 'hq'

  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-brick"
          checked={checked}
          disabled={!pickable}
          onChange={onToggle}
          aria-label={`Select ${order.id} to escalate`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{clientName(desk.clients, order.clientId)}</p>
            <span className="text-xs text-ink-soft">
              {order.id} · {order.salesperson}
            </span>
            <HoldPill status={hold.status} />
            {hold.status === 'hq' ? (
              <span className={cn('text-xs font-medium', auth.within ? 'text-palm' : 'text-rose')}>
                {auth.within ? 'Within HQ authority' : 'Outside HQ authority'}
              </span>
            ) : null}
            {auth.whitelist ? <span className="text-xs text-ink-soft">Whitelisted</span> : null}
          </div>
          <p className="mt-0.5 text-xs text-ink-soft">{lineSummary(order, desk.skus)}</p>
          <p className="mt-1 text-sm">
            Order {rm(orderTotal(order.lines))} · overdue {auth.agingMonths} month{auth.agingMonths === 1 ? '' : 's'}
            {auth.agingMonths > auth.capAgingMonths ? <span className="text-rose"> (HQ cap {auth.capAgingMonths})</span> : null}
          </p>
          {hold.status === 'hq' || hold.status === 'escalated' ? <AuthorityMeter overRm={auth.overRm} capRm={auth.capOverRm} className="mt-1.5" /> : null}
          {hold.status === 'hq' && !auth.within ? (
            <p className="mt-1 text-xs leading-5 text-rose">Must escalate: {auth.breaches.join('; ')}.</p>
          ) : null}
          {hold.status === 'rejected' ? (
            <p className="mt-1 text-xs leading-5 text-rose">Boss rejected: {hold.rejectReason}. Sales notified.</p>
          ) : null}
          {hold.reEscalateReason && hold.status === 'escalated' ? (
            <p className="mt-1 text-xs leading-5 text-ink-soft">New reason sent: {hold.reEscalateReason}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {hold.status === 'hq' ? (
            <Button
              size="sm"
              disabled={!auth.within}
              title={auth.within ? undefined : 'Outside HQ authority — escalate to the boss'}
              onClick={() => desk.hqApprove(order.id)}
            >
              HQ Approve
            </Button>
          ) : null}
          {hold.status === 'escalated' ? (
            <Button size="sm" variant="outline" onClick={onBoss}>
              Open boss phone
            </Button>
          ) : null}
        </div>
      </div>
      {hold.status === 'rejected' ? (
        <form
          className="mt-3 ml-7 flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            desk.reEscalate(order.id, reason)
            setReason('')
          }}
        >
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="New reason for the boss (required)"
            aria-label={`New reason to re-escalate ${order.id}`}
            className="h-10 min-w-60 flex-1 rounded-lg border border-line bg-paper px-3 text-sm focus-visible:border-brick focus-visible:ring-2 focus-visible:ring-brick/30 outline-none"
          />
          <Button size="sm" type="button" onClick={() => desk.resumeAfterPayment(order.id)}>Recheck payment & resume</Button>
          <Button size="sm" type="submit" disabled={reason.trim().length < 8}>
            Re-escalate
          </Button>
          <Button size="sm" type="button" variant="ghost" onClick={() => desk.moveOrder(order.id, 'cancelled')}>
            Cancel order
          </Button>
        </form>
      ) : null}
    </li>
  )
}

function BossPhone() {
  const desk = useDesk()
  const [notes, setNotes] = useState<Record<string, string>>({})
  const queue = desk.orders
    .filter((order) => order.stage === 'needs_approval' && order.hold?.status === 'escalated')
    .toSorted(byNewest)
  const done = desk.auditLog.filter((row) => row.who === 'Boss').slice(0, 3)

  return (
    <div className="mx-auto max-w-sm rounded-[1.75rem] border-4 border-ink bg-[#e4e9f0] p-2">
      <div className="rounded-2xl bg-ink px-3 py-2 text-paper">
        <p className="text-sm font-medium">HQ desk · W&H Wallcorp</p>
        <p className="text-[11px] text-sand">to {BOSS_NAME} · WhatsApp (simulated)</p>
      </div>
      <div className="mt-2 max-h-96 space-y-2 overflow-y-auto px-1 pb-1">
        {queue.length === 0 ? (
          <p className="rounded-xl bg-card px-3 py-6 text-center text-xs text-ink-soft">
            No messages waiting. Escalate rows in HQ Hold and they show up here.
          </p>
        ) : (
          <>
            <p className="rounded-xl rounded-tl-none bg-card px-3 py-2 text-xs leading-5 shadow-sm">
              {queue.length} {queue.length === 1 ? 'order needs' : 'orders need'} your yes/no — outside HQ authority or
              escalated by HQ.
            </p>
            {queue.map((order) => {
              const client = findClient(desk.clients, order.clientId)
              const auth = assessAuthority(client, orderTotal(order.lines))
              const note = notes[order.id] ?? ''
              return (
                <div key={order.id} className="rounded-xl rounded-tl-none bg-card px-3 py-2 text-xs leading-5 shadow-sm">
                  <p className="font-semibold">
                    {order.id} · {client?.company ?? 'Unmatched'}
                  </p>
                  <p>
                    {rm(orderTotal(order.lines))} · {rm(auth.overRm)} over limit · {auth.agingMonths} months overdue
                  </p>
                  <p className="text-ink-soft">Sales: {order.salesperson}</p>
                  {order.hold?.reEscalateReason ? (
                    <p className="text-ink-soft">HQ new reason: {order.hold.reEscalateReason}</p>
                  ) : null}
                  <input
                    value={note}
                    onChange={(event) => setNotes((now) => ({ ...now, [order.id]: event.target.value }))}
                    placeholder="Reason (needed to reject)"
                    aria-label={`Boss reason for ${order.id}`}
                    className="mt-2 h-10 w-full rounded-lg border border-line bg-paper px-2 outline-none focus-visible:border-brick focus-visible:ring-2 focus-visible:ring-brick/30"
                  />
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="palm" className="flex-1" onClick={() => desk.bossDecide(order.id, true, note)}>
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      className="flex-1"
                      disabled={note.trim().length === 0}
                      onClick={() => desk.bossDecide(order.id, false, note)}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              )
            })}
          </>
        )}
        {done.map((row) => (
          <p
            key={row.id}
            className={cn(
              'ml-auto w-fit max-w-[85%] rounded-xl rounded-tr-none px-3 py-2 text-xs',
              row.action === 'boss_approve' ? 'bg-palm-soft text-palm' : 'bg-rose-soft text-rose',
            )}
          >
            {row.action === 'boss_approve' ? 'Approved' : 'Rejected'} {row.orderId}
            {row.action === 'boss_reject' ? `: ${row.reason}` : ''}
          </p>
        ))}
      </div>
    </div>
  )
}

function byNewest(a: Order, b: Order): number {
  if (a.createdAt === b.createdAt) return 0
  return a.createdAt < b.createdAt ? 1 : -1
}
