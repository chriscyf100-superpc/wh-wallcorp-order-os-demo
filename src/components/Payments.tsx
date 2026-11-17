import { Collections, selectStyle } from './Collections.tsx'
import { AgeingBar, AgeingLegend } from './meters.tsx'
import { accountOwner } from '../lib/collections.ts'
import type { Ageing } from '../lib/types.ts'
import { ArrowRight, Check, MessageCircle, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { EARLY_PAY_DAYS, daysBetween } from '../lib/commission.ts'
import { rm, whenLabel } from '../lib/format.ts'
import { AGEING_LABEL } from '../lib/labels.ts'
import { METHOD_LABEL, clientBuckets, previewPayment, type PaymentPreview } from '../lib/payments.ts'
import { todayISO } from '../lib/pricedesk.ts'
import { orderTotal } from '../lib/pricing.ts'
import { useDesk } from '../lib/useDesk.ts'
import type { Client, PayMethod, Payment } from '../lib/types.ts'
import { cn } from '../lib/utils.ts'
import { AgeingPill, Note } from './bits.tsx'
import { Button } from './ui/button.tsx'
import { Input } from './ui/input.tsx'

const SELECT = 'h-10 w-full rounded-lg border border-line bg-card px-3 text-sm text-ink'

export function Payments() {
  const desk = useDesk()
  const { clients } = desk
  const [person, setPerson] = useState('')
  const [customer, setCustomer] = useState('')
  const [search, setSearch] = useState('')
  const payments = desk.payments.filter((p) => (!person || p.reportedBy === person) && (!customer || p.clientId === customer))
  const waiting = payments.filter((row) => row.status === 'reported').toSorted((a, b) => b.reportedAt.localeCompare(a.reportedAt))
  const done = payments.filter((row) => row.status !== 'reported').toSorted((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''))
  const month = todayISO().slice(0, 7)
  const inMonth = done.filter((row) => row.status === 'confirmed' && row.receivedOn.startsWith(month))
  const collected = inMonth.reduce((sum, row) => sum + row.amount, 0)
  const released = inMonth.reduce((sum, row) => sum + (row.releasedOrders?.length ?? 0), 0)
  const waitingRm = waiting.reduce((sum, row) => sum + row.amount, 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <select aria-label="Payment salesperson" className={selectStyle} value={person} onChange={(e) => setPerson(e.target.value)}>
          <option value="">All salespeople</option>
          {desk.salespeople.map((p) => (
            <option key={p.id}>{p.name}</option>
          ))}
          <option>HQ counter</option>
        </select>
        <input
          aria-label="Find payment customer"
          className={selectStyle}
          placeholder="Find customer…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setCustomer('')
          }}
        />
        <select aria-label="Payment customer" className={selectStyle} value={customer} onChange={(e) => setCustomer(e.target.value)}>
          <option value="">All customers</option>
          {clients
            .filter((c) => c.company.toLowerCase().includes(search.toLowerCase()))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.company}
              </option>
            ))}
        </select>
      </div>
      <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {desk.salespeople.map((p) => (
          <button
            key={p.id}
            onClick={() => setPerson(person === p.name ? '' : p.name)}
            aria-pressed={person === p.name}
            className={`rounded-xl border p-3 text-left ${person === p.name ? 'border-brick bg-sand' : 'border-line bg-card'}`}
          >
            <span className="text-sm font-semibold">
              {p.name} · {p.code}
            </span>
            <span className="mt-1 block text-lg tabular-nums">
              {rm(
                desk.payments
                  .filter(
                    (row) =>
                      row.reportedBy === p.name &&
                      row.status === 'confirmed' &&
                      row.receivedOn.startsWith(month) &&
                      (!customer || row.clientId === customer),
                  )
                  .reduce((sum, row) => sum + row.amount, 0),
              )}
            </span>
            <span className="block text-xs text-ink-soft">
              Collected this month ·{' '}
              {
                desk.payments.filter(
                  (row) => row.reportedBy === p.name && row.status === 'reported' && (!customer || row.clientId === customer),
                ).length
              }{' '}
              pending
            </span>
            <OwedByAge
              buckets={desk.clients
                .filter((c) => accountOwner(c.id, desk.orders, desk.payments) === p.name && (!customer || c.id === customer))
                .map((c) => clientBuckets(c))
                .reduce<Record<Ageing, number>>((sum, b) => ({ ok: sum.ok + b.ok, '30': sum['30'] + b['30'], '60': sum['60'] + b['60'], '90': sum['90'] + b['90'] }), { ok: 0, '30': 0, '60': 0, '90': 0 })}
            />
          </button>
        ))}
      </div>
      <AgeingLegend buckets={{ ok: 0, '30': 0, '60': 0, '90': 0 }} amounts={false} />
      <Collections person={person} customer={customer} />
      <Note>
        Same flow as today: the salesperson collects the cheque or sees the transfer and tells HQ on WhatsApp. Here HQ confirms it once the
        money is seen. Confirming lowers the balance (oldest ageing first), marks the invoices as paid (that date drives the 14-day
        early-pay bonus), and re-runs the credit check on anything in HQ Hold for that customer. Orders now inside the limit go to the yard;
        anything still over the limit keeps waiting for approval.
      </Note>

      <dl className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-3">
        <Stat
          label="Waiting for HQ"
          value={String(waiting.length)}
          detail={`${rm(waitingRm)} reported, not yet confirmed`}
          tone={waiting.length > 0 ? 'warn' : undefined}
        />
        <Stat
          label="Collected this month"
          value={rm(collected)}
          detail={`${inMonth.length} payment${inMonth.length === 1 ? '' : 's'} confirmed`}
        />
        <Stat label="Orders released by payment" value={String(released)} detail="Held orders that passed credit after a payment" />
      </dl>

      <section aria-labelledby="pay-waiting">
        <h2 id="pay-waiting" className="font-display text-lg">
          Reported on WhatsApp
        </h2>
        {waiting.length === 0 ? (
          <p className="mt-2 rounded-2xl border border-dashed border-line bg-card px-4 py-6 text-sm text-ink-soft">
            Nothing waiting. On the sales phone, tap “4 · Cheque received” to see one come in.
          </p>
        ) : (
          <ul className="mt-3 grid gap-4 xl:grid-cols-2">
            {waiting.map((payment) => (
              <WaitingCard key={payment.id} payment={payment} />
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <RecordForm clients={clients} />
        <History rows={done} clients={clients} />
      </div>
    </div>
  )
}

function Stat({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: 'warn' }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <dt className="text-xs font-medium tracking-wide text-ink-soft uppercase">{label}</dt>
      <dd className={cn('mt-1 font-display text-2xl tabular-nums', tone === 'warn' && 'text-amber')}>{value}</dd>
      <dd className="text-sm text-ink-soft">{detail}</dd>
    </div>
  )
}

function WaitingCard({ payment }: { payment: Payment }) {
  const desk = useDesk()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const preview = previewPayment(desk, payment)
  const client = desk.clients.find((row) => row.id === payment.clientId)

  return (
    <li className="rounded-2xl border border-line bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-ink-soft">
            {payment.reportedBy} · {whenLabel(payment.reportedAt)}
          </p>
          <p className="font-display text-2xl tabular-nums">{rm(payment.amount)}</p>
          <p className="text-sm text-ink-soft">
            {METHOD_LABEL[payment.method]}
            {payment.ref ? ` · ${payment.ref}` : ''} · received {payment.receivedOn}
          </p>
        </div>
        <span className="rounded-full bg-amber-soft px-2 py-0.5 text-xs font-medium text-amber">Waiting for HQ</span>
      </div>

      {payment.rawMessage ? (
        <p className="mt-3 flex gap-2 rounded-xl bg-[#d8f5cc]/60 px-3 py-2 text-sm leading-5">
          <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden="true" />
          <span className="whitespace-pre-wrap">{payment.rawMessage}</span>
        </p>
      ) : null}

      <label className="mt-3 block text-xs text-ink-soft">
        Customer
        <select
          className={cn(SELECT, 'mt-1')}
          value={payment.clientId ?? ''}
          onChange={(e) => desk.setPaymentClient(payment.id, e.target.value || null)}
        >
          <option value="">— pick the customer —</option>
          {desk.clients
            .toSorted((a, b) => a.company.localeCompare(b.company))
            .map((row) => (
              <option key={row.id} value={row.id}>
                {row.company}
              </option>
            ))}
        </select>
      </label>

      {preview ? (
        <Effect preview={preview} payment={payment} />
      ) : (
        <p className="mt-3 text-sm text-amber">Pick the customer to see what this payment does.</p>
      )}

      {rejecting ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            desk.rejectPayment(payment.id, reason)
          }}
        >
          <label className="min-w-0 flex-1 text-xs text-ink-soft">
            Why not accepted?
            <Input
              className="mt-1"
              autoFocus
              placeholder="Cheque bounced / not in the bank yet"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <Button type="submit" variant="ghost" className="text-rose">
            Reject
          </Button>
          <Button type="button" variant="ghost" onClick={() => setRejecting(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" disabled={!client} onClick={() => desk.confirmPayment(payment.id)}>
            <Check className="h-4 w-4" aria-hidden="true" /> Confirm — money received
          </Button>
          <Button type="button" variant="ghost" onClick={() => setRejecting(true)}>
            <X className="h-4 w-4" aria-hidden="true" /> Not received
          </Button>
        </div>
      )}
    </li>
  )
}

function Effect({ preview, payment }: { preview: PaymentPreview; payment: Pick<Payment, 'receivedOn'> }) {
  const { before, after } = preview
  const roomBefore = before.creditLimit - before.outstanding
  const roomAfter = after.creditLimit - after.outstanding
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-line bg-sand/40 p-3 text-sm">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Side title="Now" client={before} room={roomBefore} />
        <ArrowRight className="h-4 w-4 text-ink-soft" aria-hidden="true" />
        <Side title="After this payment" client={after} room={roomAfter} />
      </div>
      <AgeBar before={before} after={after} />
      {preview.cleared.length > 0 ? (
        <p className="text-xs text-ink-soft">
          Clears {preview.cleared.map((row) => `${rm(row.amount)} of ${AGEING_LABEL[row.age].toLowerCase()}`).join(', ')} — oldest first.
          {preview.unapplied > 0 ? ` ${rm(preview.unapplied)} more than they owe (left as credit).` : ''}
        </p>
      ) : null}
      {preview.settles.length > 0 ? (
        <p className="text-xs">
          Marks paid:{' '}
          {preview.settles.map((order) => {
            const days = daysBetween(order.invoicedAt ?? order.createdAt.slice(0, 10), payment.receivedOn)
            return (
              <span key={order.id} className="mr-2 inline-block">
                {order.id} ({rm(orderTotal(order.lines))}, {order.salesperson}, paid in {days} day{days === 1 ? '' : 's'}
                {days <= EARLY_PAY_DAYS ? <span className="font-medium text-ok"> · early-pay +3%</span> : ''})
              </span>
            )
          })}
        </p>
      ) : null}
      {preview.releases.length > 0 ? (
        <p className="rounded-lg bg-ok-soft px-2 py-1.5 text-xs text-ok">
          Now passes credit — goes to the yard: {preview.releases.map((order) => `${order.id} (${rm(orderTotal(order.lines))})`).join(', ')}
        </p>
      ) : null}
      {preview.stillHeld.length > 0 ? (
        <p className="rounded-lg bg-amber-soft px-2 py-1.5 text-xs text-amber">
          Still over the limit or overdue — stays in HQ Hold for approval: {preview.stillHeld.map((order) => order.id).join(', ')}
        </p>
      ) : null}
    </div>
  )
}

function Side({ title, client, room }: { title: string; client: Client; room: number }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-ink-soft">{title}</p>
      <p className="font-medium tabular-nums">{rm(client.outstanding)}</p>
      <p className={cn('text-xs tabular-nums', room < 0 ? 'text-rose' : 'text-ink-soft')}>
        {room < 0 ? `${rm(-room)} over limit` : `${rm(room)} room`}
      </p>
      <div className="mt-1">
        <AgeingPill ageing={client.ageing} />
      </div>
    </div>
  )
}

const AGE_ORDER = ['ok', '30', '60', '90'] as const
const AGE_BAR = { ok: 'bg-ok', '30': 'bg-gold', '60': 'bg-amber', '90': 'bg-rose' } as const

function AgeBar({ before, after }: { before: Client; after: Client }) {
  const b = clientBuckets(before)
  const a = clientBuckets(after)
  const scale = Math.max(before.creditLimit, before.outstanding, 1)
  const bar = (buckets: typeof b, label: string) => (
    <div className="flex items-center gap-2">
      <span className="w-12 text-xs text-ink-soft">{label}</span>
      <span className="relative flex h-2.5 flex-1 overflow-hidden rounded-full bg-paper-deep">
        {AGE_ORDER.map((key) =>
          buckets[key] > 0 ? (
            <span
              key={key}
              className={cn(AGE_BAR[key], 'border-r-2 border-card last:border-r-0')}
              style={{ width: `${(buckets[key] / scale) * 100}%` }}
            />
          ) : null,
        )}
      </span>
    </div>
  )
  return (
    <div className="space-y-1" aria-label="Balance by age, before and after">
      {bar(b, 'Before')}
      {bar(a, 'After')}
      <p className="flex flex-wrap gap-x-3 text-[11px] text-ink-soft">
        {AGE_ORDER.map((key) => (
          <span key={key} className="inline-flex items-center gap-1">
            <span className={cn('h-2 w-2 rounded-full', AGE_BAR[key])} aria-hidden="true" />
            {AGEING_LABEL[key]}
          </span>
        ))}
        <span>· bar length = share of the {rm(before.creditLimit)} limit</span>
      </p>
    </div>
  )
}

function RecordForm({ clients }: { clients: Client[] }) {
  const desk = useDesk()
  const [search, setSearch] = useState('')
  const [clientId, setClientId] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PayMethod>('cheque')
  const [ref, setRef] = useState('')
  const [date, setDate] = useState(todayISO())
  const [by, setBy] = useState('Boon')
  const [error, setError] = useState('')
  const value = Number(amount.replaceAll(',', ''))
  const preview = clientId && value > 0 ? previewPayment(desk, { clientId, amount: value, receivedOn: date }) : null

  function submit(event: FormEvent, confirmNow: boolean) {
    event.preventDefault()
    if (!clientId) return setError('Pick the customer.')
    if (!Number.isFinite(value) || !(value > 0)) return setError('Amount must be more than zero.')
    setError('')
    desk.recordPayment(
      { clientId, amount: Math.round(value * 100) / 100, method, ref: ref.trim(), reportedBy: by, receivedOn: date },
      confirmNow,
    )
    setAmount('')
    setRef('')
  }

  return (
    <form className="rounded-2xl border border-line bg-card p-4" onSubmit={(event) => submit(event, true)}>
      <h2 className="font-display text-lg">Record a payment</h2>
      <p className="text-sm text-ink-soft">For money HQ sees directly (bank statement, counter cash).</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="col-span-2 text-xs text-ink-soft">
          Customer
          <Input
            aria-label="Search customer to record payment"
            className="mt-1"
            placeholder="Search customer"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setClientId('')
            }}
          />
          <select className={cn(SELECT, 'mt-1')} value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">— pick —</option>
            {clients
              .filter((c) => c.company.toLowerCase().includes(search.toLowerCase()))
              .toSorted((a, b) => b.outstanding - a.outstanding)
              .map((row) => (
                <option key={row.id} value={row.id}>
                  {row.company} · owes {rm(row.outstanding)}
                </option>
              ))}
          </select>
        </label>
        <label className="text-xs text-ink-soft">
          Amount (RM)
          <Input className="mt-1" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="8,400" />
        </label>
        <label className="text-xs text-ink-soft">
          Method
          <select className={cn(SELECT, 'mt-1')} value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
            {(Object.keys(METHOD_LABEL) as PayMethod[]).map((key) => (
              <option key={key} value={key}>
                {METHOD_LABEL[key]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink-soft">
          Cheque / ref no.
          <Input className="mt-1" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="PBB 004512" />
        </label>
        <label className="text-xs text-ink-soft">
          Received on
          <Input className="mt-1" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="col-span-2 text-xs text-ink-soft">
          Collected by
          <select className={cn(SELECT, 'mt-1')} value={by} onChange={(e) => setBy(e.target.value)}>
            {desk.salespeople.map(({ name }) => (
              <option key={name}>{name}</option>
            ))}
            <option>HQ counter</option>
          </select>
        </label>
      </div>
      {preview ? <Effect preview={preview} payment={{ receivedOn: date }} /> : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-rose">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="submit">Record and confirm</Button>
        <Button type="button" variant="ghost" onClick={(event) => submit(event, false)}>
          Log only (confirm later)
        </Button>
      </div>
    </form>
  )
}

function History({ rows, clients }: { rows: Payment[]; clients: Client[] }) {
  return (
    <section className="min-w-0 rounded-2xl border border-line bg-card p-4" aria-labelledby="pay-history">
      <h2 id="pay-history" className="font-display text-lg">
        Confirmed and rejected
      </h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">Nothing yet. Confirm a payment and it lands here with what it changed.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="text-xs text-ink-soft uppercase">
              <tr>
                <th className="py-1 pr-2">Customer</th>
                <th className="pr-2 text-right">Amount</th>
                <th className="pr-2">Balance</th>
                <th className="pr-2">Effect</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-line align-top">
                  <td className="py-2 pr-2">
                    <span className="block font-medium">{clients.find((c) => c.id === row.clientId)?.company ?? '—'}</span>
                    <span className="block text-xs text-ink-soft">
                      {METHOD_LABEL[row.method]} {row.ref} · {row.reportedBy} · {row.receivedOn}
                    </span>
                  </td>
                  <td className="pr-2 text-right font-medium tabular-nums">{rm(row.amount)}</td>
                  <td className="pr-2 text-xs tabular-nums">
                    {row.status === 'confirmed' ? (
                      `${rm(row.outstandingBefore ?? 0)} → ${rm(row.outstandingAfter ?? 0)}`
                    ) : (
                      <span className="text-rose">Rejected</span>
                    )}
                  </td>
                  <td className="pr-2 text-xs">
                    {row.status === 'rejected'
                      ? row.rejectReason
                      : [
                          row.releasedOrders?.length ? `Released ${row.releasedOrders.join(', ')}` : null,
                          row.settledOrders?.length ? `Paid ${row.settledOrders.join(', ')}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Balance only'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function OwedByAge({ buckets }: { buckets: Record<Ageing, number> }) {
  const total = buckets.ok + buckets['30'] + buckets['60'] + buckets['90']
  const late = buckets['60'] + buckets['90']
  return (
    <span className="mt-2 block border-t border-line pt-2">
      <span className="block text-xs text-ink-soft tabular-nums">
        Their customers owe <span className="font-medium text-ink">{rm(total).replace(/\.00$/, '')}</span>
        {late > 0 ? <span className="text-rose"> · {rm(late).replace(/\.00$/, '')} at 60+ days</span> : null}
      </span>
      <AgeingBar buckets={buckets} className="mt-1" />
    </span>
  )
}
