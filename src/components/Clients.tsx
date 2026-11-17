import { rm } from '../lib/format.ts'
import { clientBuckets } from '../lib/payments.ts'
import { useDesk } from '../lib/useDesk.ts'
import type { Client } from '../lib/types.ts'
import { cn } from '../lib/utils.ts'
import { AgeingPill, Note } from './bits.tsx'
import { AgeingBar, AgeingLegend, LimitMeter } from './meters.tsx'
import { AGE_ORDER } from '../lib/ageing.ts'
import type { Ageing } from '../lib/types.ts'

export function Clients() {
  const { clients } = useDesk()
  const ranked = clients.toSorted((a, b) => clientRank(a) - clientRank(b) || a.company.localeCompare(b.company))
  const book: Record<Ageing, number> = { ok: 0, '30': 0, '60': 0, '90': 0 }
  for (const client of clients) {
    const own = clientBuckets(client)
    for (const key of AGE_ORDER) book[key] += own[key]
  }
  const total = AGE_ORDER.reduce((sum, key) => sum + book[key], 0)
  const overLimit = clients.filter((c) => c.creditLimit > 0 && c.outstanding > c.creditLimit)
  const stopped = clients.filter((c) => c.ageing === '60' || c.ageing === '90')
  const tiles = [
    { label: 'Total owed', value: rm(total).replace(/\.\d\d$/, ''), detail: `${clients.filter((c) => c.outstanding > 0).length} accounts with a balance` },
    { label: 'Over the credit limit', value: String(overLimit.length), detail: overLimit.length ? `${rm(overLimit.reduce((s, c) => s + c.outstanding - c.creditLimit, 0)).replace(/\.\d\d$/, '')} past the limits` : 'None', warn: overLimit.length > 0 },
    { label: '60 / 90 days overdue', value: String(stopped.length), detail: 'New orders wait for HQ', warn: stopped.length > 0 },
  ]

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-line bg-card p-4" aria-labelledby="book-heading">
        <h2 id="book-heading" className="text-sm font-medium text-ink-soft">
          The whole book by age · from EMAS
        </h2>
        <dl className="mt-2 grid gap-3 sm:grid-cols-3">
          {tiles.map((tile) => (
            <div key={tile.label}>
              <dt className="text-xs text-ink-soft">{tile.label}</dt>
              <dd className={cn('text-2xl font-semibold tracking-tight', tile.warn && 'text-rose')}>{tile.value}</dd>
              <dd className="text-xs text-ink-soft">{tile.detail}</dd>
            </div>
          ))}
        </dl>
        <AgeingBar buckets={book} tall className="mt-4" />
        <AgeingLegend buckets={book} className="mt-2" />
      </section>
      <Note>
        HQ approval if they are 60 or 90 days overdue, or if outstanding plus this order would pass the limit. A 30-day
        account still inside the limit can be confirmed. A confirmed payment (Payments in) clears the oldest money first,
        so an account can drop out of 60 / 90 days and order again without approval.
      </Note>
      <ul className="grid gap-3 lg:grid-cols-2">
        {ranked.map((client) => (
          <ClientCard key={client.id} client={client} />
        ))}
      </ul>
    </div>
  )
}

function ClientCard({ client }: { client: Client }) {
  const room = client.creditLimit - client.outstanding
  const buckets = clientBuckets(client)

  return (
    <li className="rounded-2xl border border-line bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg leading-tight tracking-tight">{client.company}</h2>
          <p className="mt-1 text-sm text-ink-soft">
            {client.area} · {client.phone}
          </p>
        </div>
        <AgeingPill ageing={client.ageing} />
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-xs text-ink-soft">Limit</dt>
          <dd className="font-medium">{rm(client.creditLimit)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-soft">Outstanding</dt>
          <dd className="font-medium">{rm(client.outstanding)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-soft">{room < 0 ? 'Over by' : 'Room'}</dt>
          <dd className={cn('font-medium', room < 0 ? 'text-rose' : '')}>{rm(Math.abs(room))}</dd>
        </div>
      </dl>
      <LimitMeter owed={client.outstanding} limit={client.creditLimit} text={false} className="mt-3" />
      <p className="mt-3 text-xs font-medium text-ink-soft">Owed by age</p>
      <AgeingBar buckets={buckets} className="mt-1" />
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3">
        <AgeingLegend buckets={buckets} />
        {client.lastPaymentAt ? <span className="text-xs text-ok">Paid {client.lastPaymentAt}</span> : null}
      </div>
      <p className="mt-3 text-sm leading-6 text-ink-soft">{clientNote(client)}</p>
    </li>
  )
}

function clientNote(client: Client): string {
  const over = client.outstanding > client.creditLimit
  const room = client.creditLimit - client.outstanding
  if (over) return 'Already over the limit. New orders wait for HQ.'
  if (client.ageing === '60' || client.ageing === '90') {
    return `${client.ageing} days overdue. New orders wait for HQ.`
  }
  if (room >= 0 && room < 2000) return 'Close to the limit. A normal order can trip HQ.'
  if (client.ageing === '30') return '30 days on the book. Still inside the limit. You can confirm.'
  return 'Inside the limit, payments current.'
}

function clientRank(client: Client): number {
  if (client.outstanding > client.creditLimit) return 0
  if (client.ageing === '90') return 1
  if (client.ageing === '60') return 2
  if (client.ageing === '30') return 3
  return 4
}
