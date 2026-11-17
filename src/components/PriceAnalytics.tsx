import { useState } from 'react'
import { monthEnd, priceComparison } from '../lib/priceAnalytics.ts'
import { todayISO } from '../lib/pricedesk.ts'
import { rm } from '../lib/format.ts'
import { useDesk } from '../lib/useDesk.ts'
import { selectStyle } from './Collections.tsx'
import { DivergingMonths, SERIES } from './charts.tsx'

const monthLabelLong = (key: string) => new Date(`${key}-01T00:00:00`).toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })

export function PriceAnalytics() {
  const { priceRows, products } = useDesk()
  const [month, setMonth] = useState(todayISO().slice(0, 7))
  const [period, setPeriod] = useState(-1)
  const [query, setQuery] = useState('')
  const asOf = month === todayISO().slice(0, 7) ? todayISO() : monthEnd(month)
  const rows = priceRows.filter((r) =>
    `${r.code} ${products.find((p) => p.code === r.code)?.name ?? ''}`.toLowerCase().includes(query.toLowerCase()),
  )
  const compared = priceComparison(rows, asOf, monthEnd(month, period))
  const mean = (rs: typeof compared) => (rs.length ? rs.reduce((s, r) => s + r.pct, 0) / rs.length : null)
  const movers = compared
    .filter((r) => Math.abs(r.delta) > 0.000001)
    .toSorted((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 10)
  const max = Math.max(1, ...movers.map((r) => Math.abs(r.pct)))
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const end = monthEnd(month, i - 11)
    const day = end > asOf ? asOf : end
    const r = priceComparison(rows, day, monthEnd(month, i - 12))
    return { month: end.slice(0, 7), value: mean(r), count: r.length }
  })
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          type="month"
          aria-label="Price analysis month"
          className={selectStyle}
          value={month}
          max={todayISO().slice(0, 7)}
          onChange={(e) => {
            if (e.target.value) setMonth(e.target.value)
          }}
        />
        <select
          aria-label="Price comparison period"
          className={selectStyle}
          value={period}
          onChange={(e) => setPeriod(Number(e.target.value))}
        >
          <option value={-1}>Month on month</option>
          <option value={-12}>Year on year</option>
        </select>
        <input
          className={selectStyle}
          aria-label="Filter price analytics"
          placeholder="Item name or code"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <p className="text-sm text-ink-soft">
        As of {asOf} vs {monthEnd(month, period)}. Exact matching price rows only: same item, zone, delivery mode and quantity tier.
        Equal-weight row average, not a sales-weighted inflation index. Missing history is excluded, never assumed to be zero.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['Average change', mean(compared) === null ? 'No comparable history' : `${mean(compared)!.toFixed(2)}%`],
          ['Comparable rows', compared.length],
          ['Increases / decreases', `${compared.filter((r) => r.delta > 0).length} / ${compared.filter((r) => r.delta < 0).length}`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-line bg-card p-4">
            <p className="text-xs text-ink-soft">{label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <section className="rounded-2xl border border-line bg-card p-4">
        <h2 className="text-lg font-semibold">Monthly price movement</h2>
        <p className="text-xs text-ink-soft">Mean change on matching price rows, each month against the month before. Hover a month for the row count.</p>
        <div className="mt-3">
          <DivergingMonths
            label="Mean monthly price change, last 12 months"
            points={monthly.map((m) => ({
              key: m.month,
              label: new Date(`${m.month}-01T00:00:00`).toLocaleDateString('en-MY', { month: 'short' }),
              value: m.value,
              note: `${monthLabelLong(m.month)} · ${m.count} matching rows`,
            }))}
          />
        </div>
        <table className="sr-only">
          <caption>Mean monthly price change</caption>
          <tbody>
            {monthly.map((m) => (
              <tr key={m.month}>
                <th>{m.month}</th>
                <td>{m.value === null ? 'no data' : `${m.value.toFixed(2)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="rounded-2xl border border-line bg-card p-4">
        <h2 className="text-lg font-semibold">Largest price moves · top 10 rows</h2>
        {!movers.length && (
          <p className="py-5 text-sm text-ink-soft">
            {compared.length
              ? 'No price changes among comparable rows.'
              : 'Not enough dated history for this period. Try a different month or month-on-month.'}
          </p>
        )}
        <ul className="mt-3 space-y-4">
          {movers.map((r) => (
            <li key={r.id}>
              <div className="flex justify-between gap-4 text-sm">
                <div>
                  <span className="font-medium">{products.find((p) => p.code === r.code)?.name ?? r.code}</span>
                  <p className="text-xs text-ink-soft">
                    {r.code} · {r.zone} · {r.mode} · {r.minQty}+ {r.tierUnit}
                  </p>
                </div>
                <span className="shrink-0 text-right tabular-nums">
                  {r.pct > 0 ? '+' : ''}
                  {r.pct.toFixed(2)}%
                  <span className="block text-xs">
                    {rm(r.before)} → {rm(r.sell)}
                  </span>
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-paper-deep">
                <div className="h-2 rounded-full" style={{ width: `${(Math.abs(r.pct) / max) * 100}%`, background: r.delta < 0 ? SERIES.now : SERIES.last }} />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
