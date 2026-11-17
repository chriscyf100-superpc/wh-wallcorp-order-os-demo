import { ChevronDown, Search } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { activityOf, customerRows, type Activity, type CustomerRow } from '../lib/customers.ts'
import { rm } from '../lib/format.ts'
import { useDesk } from '../lib/useDesk.ts'
import { cn } from '../lib/utils.ts'
import { RankBars, SERIES, shortRm } from './charts.tsx'
import { AgeingPill, Note } from './bits.tsx'
import { Input } from './ui/input.tsx'

const ACTIVITY: Record<Activity, { label: string; hint: string; cls: string }> = {
  active: { label: 'Active', hint: 'ordered in the last 14 days', cls: 'bg-ok-soft text-ok' },
  quiet: { label: 'Quiet', hint: '15–45 days since the last order', cls: 'bg-amber-soft text-amber' },
  dormant: { label: 'Dormant', hint: 'over 45 days — worth a call', cls: 'bg-rose-soft text-rose' },
  none: { label: 'No orders', hint: 'nothing on record', cls: 'bg-paper-deep text-ink-soft' },
}

type Sort = 'last' | 'sales' | 'orders' | 'name'

const ago = (days: number | null): string => (days === null ? '—' : days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`)
const fmtDate = (date: string): string => new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export function Customers() {
  const { clients, orders, skus } = useDesk()
  const rows = useMemo(() => customerRows(clients, orders, skus), [clients, orders, skus])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Activity | 'all'>('all')
  const [sort, setSort] = useState<Sort>('last')
  const [open, setOpen] = useState<string | null>(null)

  const counts = { active: 0, quiet: 0, dormant: 0, none: 0 }
  for (const row of rows) counts[row.activity] += 1
  const latest = rows
    .flatMap((row) => row.rows.slice(0, 3).map((entry) => ({ entry, client: row.client })))
    .toSorted((a, b) => b.entry.date.localeCompare(a.entry.date) || (a.entry.source === 'board' ? -1 : 1))
    .slice(0, 8)
  const newest = latest[0]
  const top = rows.toSorted((a, b) => b.sales12m - a.sales12m).slice(0, 8)

  const needle = query.trim().toLowerCase()
  const shown = rows
    .filter((row) => filter === 'all' || row.activity === filter)
    .filter((row) => !needle || row.client.company.toLowerCase().includes(needle) || row.client.area.toLowerCase().includes(needle) || row.mainPerson.toLowerCase().includes(needle))
    .toSorted((a, b) => {
      if (sort === 'sales') return b.sales12m - a.sales12m
      if (sort === 'orders') return b.orders12m - a.orders12m
      if (sort === 'name') return a.client.company.localeCompare(b.client.company)
      return (a.daysSince ?? 1e9) - (b.daysSince ?? 1e9)
    })

  return (
    <div className="space-y-5">
      <Note>
        Every customer, when they last ordered and through whom, and how much they buy. Board orders are live; earlier
        invoices are a demo stand-in for the EMAS invoice listing (same columns: date, debtor, salesperson, amount).
      </Note>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="col-span-2 rounded-2xl border border-line bg-card p-4 lg:col-span-1">
          <dt className="text-xs font-medium tracking-wide text-ink-soft uppercase">Last to order</dt>
          {newest ? (
            <>
              <dd className="mt-1 font-display text-base leading-tight tracking-tight">{newest.client.company}</dd>
              <dd className="text-sm text-ink-soft">
                {fmtDate(newest.entry.date)} · {newest.entry.salesperson} · {rm(newest.entry.amount)}
              </dd>
            </>
          ) : (
            <dd className="mt-1 text-sm text-ink-soft">No orders yet</dd>
          )}
        </div>
        {(['active', 'quiet', 'dormant'] as const).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(filter === key ? 'all' : key)}
            className={cn('rounded-2xl border bg-card p-4 text-left transition hover:border-brick/40', filter === key ? 'border-brick ring-2 ring-brick/20' : 'border-line')}
          >
            <dt className="flex items-center gap-2 text-xs font-medium tracking-wide text-ink-soft uppercase">
              <span className={cn('rounded-full px-2 py-0.5 normal-case', ACTIVITY[key].cls)}>{ACTIVITY[key].label}</span>
            </dt>
            <dd className="mt-1 font-display text-2xl tabular-nums">{counts[key]}</dd>
            <dd className="text-sm text-ink-soft">{ACTIVITY[key].hint}</dd>
          </button>
        ))}
      </dl>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <section className="min-w-0 rounded-2xl border border-line bg-card p-4" aria-labelledby="latest-heading">
          <h2 id="latest-heading" className="font-display text-lg">
            Latest orders
          </h2>
          <ul className="mt-2 divide-y divide-line">
            {latest.map(({ entry, client }) => (
              <li key={entry.ref} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{client.company}</span>
                  <span className="block truncate text-xs text-ink-soft">
                    {fmtDate(entry.date)} · {entry.salesperson} · {entry.source === 'board' ? entry.ref : 'EMAS invoice'}
                    {entry.items ? ` · ${entry.items}` : ''}
                  </span>
                </span>
                <span className="shrink-0 font-medium tabular-nums">{rm(entry.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="min-w-0 rounded-2xl border border-line bg-card p-4" aria-labelledby="top-heading">
          <h2 id="top-heading" className="font-display text-lg">
            Biggest customers
          </h2>
          <p className="mb-3 text-sm text-ink-soft">Sales in the last 12 months</p>
          <RankBars rows={top.map((row) => ({ key: row.client.id, label: row.client.company.replace(/ Sdn Bhd$/, ''), value: row.sales12m, sub: `${row.orders12m} orders · ${row.mainPerson}` }))} format={shortRm} />
        </section>
      </div>

      <section className="min-w-0 rounded-2xl border border-line bg-card p-4" aria-labelledby="all-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="all-heading" className="font-display text-lg">
            All customers <span className="text-base font-normal text-ink-soft">({shown.length})</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <span className="sr-only">Search customers</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden="true" />
              <Input className="w-56 pl-9" placeholder="Name, area or salesperson" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <select aria-label="Sort" className="h-10 rounded-lg border border-line bg-card px-2 text-sm" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="last">Last ordered first</option>
              <option value="sales">Biggest sales first</option>
              <option value="orders">Most orders first</option>
              <option value="name">A–Z</option>
            </select>
            {filter !== 'all' ? (
              <button type="button" className="min-h-10 px-2 text-sm font-medium text-brick" onClick={() => setFilter('all')}>
                Show all
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="text-xs text-ink-soft uppercase">
              <tr>
                <th className="py-1 pr-3">Customer</th>
                <th className="pr-3">Last ordered</th>
                <th className="pr-3 text-right">Orders · 12m</th>
                <th className="pr-3 text-right">Sales · 12m</th>
                <th className="pr-3">Last 12 months</th>
                <th className="pr-3">Mostly via</th>
                <th className="pr-3 text-right">Owes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <Fragment key={row.client.id}>
                  <tr className={cn('cursor-pointer border-t border-line hover:bg-sand/50', open === row.client.id && 'bg-sand/50')} onClick={() => setOpen(open === row.client.id ? null : row.client.id)}>
                    <td className="py-2.5 pr-3">
                      <span className="block font-medium">{row.client.company}</span>
                      <span className="block text-xs text-ink-soft">{row.client.area}</span>
                    </td>
                    <td className="pr-3">
                      <span className="flex items-center gap-2">
                        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', ACTIVITY[activityOf(row.daysSince)].cls)}>{ago(row.daysSince)}</span>
                      </span>
                      {row.last ? (
                        <span className="mt-0.5 block text-xs text-ink-soft">
                          {fmtDate(row.last.date)} · {row.last.salesperson} · {rm(row.last.amount)}
                        </span>
                      ) : null}
                    </td>
                    <td className="pr-3 text-right tabular-nums">{row.orders12m}</td>
                    <td className="pr-3 text-right font-medium tabular-nums">{shortRm(row.sales12m)}</td>
                    <td className="pr-3">
                      <Spark values={row.monthly} label={`${row.client.company}, monthly sales`} />
                    </td>
                    <td className="pr-3">{row.mainPerson}</td>
                    <td className="pr-3 text-right">
                      <span className="block tabular-nums">{rm(row.client.outstanding)}</span>
                      <AgeingPill ageing={row.client.ageing} />
                    </td>
                    <td className="text-right">
                      <ChevronDown className={cn('inline h-4 w-4 text-ink-soft transition', open === row.client.id && 'rotate-180')} aria-hidden="true" />
                    </td>
                  </tr>
                  {open === row.client.id ? (
                    <tr className="bg-sand/30">
                      <td colSpan={8} className="px-3 pb-3">
                        <Detail row={row} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
          {shown.length === 0 ? <p className="py-4 text-sm text-ink-soft">No customer matches.</p> : null}
        </div>
      </section>
    </div>
  )
}

function Spark({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(...values, 1)
  return (
    <svg viewBox="0 0 96 24" className="h-6 w-24" role="img" aria-label={label}>
      {values.map((value, i) => {
        const h = value > 0 ? Math.max(2, (value / max) * 22) : 0
        return <rect key={i} x={i * 8 + 1} y={24 - h} width="6" height={h} rx="1.5" fill={SERIES.now} opacity={i === values.length - 1 ? 0.5 : 1} />
      })}
    </svg>
  )
}

function Detail({ row }: { row: CustomerRow }) {
  return (
    <div className="grid gap-4 pt-2 md:grid-cols-[1fr_16rem]">
      <div>
        <h3 className="text-xs font-medium tracking-wide text-ink-soft uppercase">Recent invoices & orders</h3>
        <ul className="mt-1 divide-y divide-line text-sm">
          {row.rows.slice(0, 8).map((entry) => (
            <li key={entry.ref} className="flex justify-between gap-3 py-1.5">
              <span className="min-w-0 truncate">
                {fmtDate(entry.date)} · {entry.salesperson} · <span className="text-ink-soft">{entry.source === 'board' ? entry.ref : 'EMAS invoice'}</span>
                {entry.items ? <span className="text-ink-soft"> · {entry.items}</span> : null}
              </span>
              <span className="shrink-0 tabular-nums">{rm(entry.amount)}</span>
            </li>
          ))}
        </ul>
      </div>
      <dl className="grid grid-cols-2 gap-2 self-start text-sm">
        <div>
          <dt className="text-xs text-ink-soft">This year</dt>
          <dd className="font-medium tabular-nums">{shortRm(row.salesYtd)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-soft">Average order</dt>
          <dd className="font-medium tabular-nums">{shortRm(row.avgOrder)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-soft">Credit limit</dt>
          <dd className="font-medium tabular-nums">{rm(row.client.creditLimit)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-soft">Phone</dt>
          <dd className="font-medium">{row.client.phone}</dd>
        </div>
      </dl>
    </div>
  )
}
