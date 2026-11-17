import { useState } from 'react'
import { accountOwner, collectionRisk } from '../lib/collections.ts'
import { rm } from '../lib/format.ts'
import { clientBuckets } from '../lib/payments.ts'
import { useDesk } from '../lib/useDesk.ts'
import { Button } from './ui/button.tsx'
import { LimitLegend, LimitMeter } from './meters.tsx'

export const selectStyle = 'h-10 rounded-lg border border-line bg-card px-3 text-sm'

export function Collections({ person, customer }: { person: string; customer: string }) {
  const desk = useDesk()
  const [riskOnly, setRiskOnly] = useState(false)
  const rows = desk.clients
    .filter((c) => (!customer || c.id === customer) && (!person || accountOwner(c.id, desk.orders, desk.payments) === person))
    .map((client) => ({ client, owner: accountOwner(client.id, desk.orders, desk.payments), risk: collectionRisk(client, desk.orders) }))
    .filter((r) => !riskOnly || r.risk.shortage > 0 || r.risk.overdue)
    .toSorted((a, b) => b.risk.shortage - a.risk.shortage)
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Collections watch · 收款跟进</h2>
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={riskOnly} onChange={(e) => setRiskOnly(e.target.checked)} />
          At risk only
        </label>
      </div>
      <p className="mt-2 text-sm text-ink-soft">
        Customer owner follows their latest order (or latest payment). Balances are whole-account totals, counted once. Forecast = amount
        owed + uninvoiced open SOs + average completed order; an estimate, not a credit approval.
      </p>
      <div className="my-4 grid gap-3 sm:grid-cols-3">
        {[
          ['Total owed', rm(rows.reduce((s, r) => s + r.client.outstanding, 0))],
          ['Ongoing SOs', rows.reduce((s, r) => s + r.risk.open, 0)],
          ['Customers at risk', rows.filter((r) => r.risk.shortage > 0 || r.risk.overdue).length],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-paper p-3">
            <p className="text-xs text-ink-soft">{label}</p>
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <LimitLegend />
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr>
              {['Customer / owner', 'Owes / limit', 'Open SOs', 'Average deal', 'Next-order outlook', 'Follow up'].map((h) => (
                <th key={h} className="py-2 pr-4">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ client: c, owner, risk: r }) => (
              <tr key={c.id} className="border-t border-line">
                <td className="py-3 pr-3 font-medium">
                  {c.company}
                  <span className="block text-xs text-ink-soft">{owner}</span>
                </td>
                <td className="w-56 pr-4">
                  <span className="tabular-nums">{rm(c.outstanding)}</span>
                  <LimitMeter owed={c.outstanding} committed={r.committed} limit={c.creditLimit} className="mt-1" />
                </td>
                <td>
                  {r.open}
                  <span className="block text-xs">{rm(r.committed)} uninvoiced</span>
                </td>
                <td>
                  {r.average === null ? 'No history' : rm(r.average)}
                  <span className="block text-xs text-ink-soft">{r.sample} completed orders</span>
                </td>
                <td className={r.shortage > 0 || r.overdue ? 'text-amber' : 'text-ok'}>
                  {r.shortage > 0 ? `Chase ${rm(r.shortage)}` : r.average === null ? 'Insufficient history' : 'Within estimated limit'}
                  {r.overdue && <span className="block text-xs">Overdue credit stop</span>}
                </td>
                <td>
                  <Button size="sm" variant="outline" disabled={owner === 'Unassigned'} onClick={() => desk.notifyCollection(c.id, owner)}>
                    Notify sales
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="py-6 text-sm text-ink-soft">No customers match these filters.</p>}
      </div>
    </section>
  )
}

export function DebtorAging() {
  const desk = useDesk()
  const [person, setPerson] = useState('')
  const [query, setQuery] = useState('')
  const [generated, setGenerated] = useState<null | {
    at: string
    rows: { company: string; owner: string; outstanding: number; buckets: ReturnType<typeof clientBuckets> }[]
  }>(null)
  function generate() {
    setGenerated({
      at: new Date().toLocaleString('en-MY'),
      rows: desk.clients
        .filter(
          (c) =>
            c.outstanding > 0 &&
            (!person || accountOwner(c.id, desk.orders, desk.payments) === person) &&
            c.company.toLowerCase().includes(query.toLowerCase()),
        )
        .map((c) => ({
          company: c.company,
          owner: accountOwner(c.id, desk.orders, desk.payments),
          outstanding: c.outstanding,
          buckets: clientBuckets(c),
        })),
    })
  }
  function download() {
    if (!generated) return
    const cell = (v: string | number) =>
      '"' +
      String(v)
        .replace(/^[=+@-]/, "'")
        .replaceAll('"', '""') +
      '"'
    const rows = [
      ['Customer', 'Salesperson', 'Current', '30 days', '60 days', '90+ days', 'Total'],
      ...generated.rows.map((r) => [r.company, r.owner, r.buckets.ok, r.buckets['30'], r.buckets['60'], r.buckets['90'], r.outstanding]),
    ]
    const url = URL.createObjectURL(
      new Blob(['\ufeff' + rows.map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }),
    )
    const a = document.createElement('a')
    a.href = url
    a.download = 'debtor-aging.csv'
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h2 className="text-xl font-semibold">Debtor aging · 账龄报告</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Generate a snapshot of the current demo account balances. Confirmed payments clear the oldest bucket first; historical as-of
        reporting needs the EMAS invoice ledger.
      </p>
      <div className="my-3 flex flex-wrap gap-2">
        <select
          aria-label="Aging salesperson"
          className={selectStyle}
          value={person}
          onChange={(e) => {
            setPerson(e.target.value)
            setGenerated(null)
          }}
        >
          <option value="">All salespeople</option>
          {desk.salespeople.map((p) => (
            <option key={p.id}>{p.name}</option>
          ))}
          <option>Unassigned</option>
        </select>
        <input
          className={selectStyle}
          aria-label="Aging customer search"
          placeholder="Search customer"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setGenerated(null)
          }}
        />
        <Button onClick={generate}>Generate debtor aging</Button>
        {generated && (
          <Button variant="outline" onClick={download}>
            Download CSV
          </Button>
        )}
      </div>
      {generated && (
        <>
          <p className="text-xs text-ink-soft">
            Snapshot {generated.at} · {generated.rows.length} customers · Total {rm(generated.rows.reduce((s, r) => s + r.outstanding, 0))}.
            Regenerate after new payments.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead>
                <tr>
                  {['Customer', 'Salesperson', 'Current', '30 days', '60 days', '90+ days', 'Total'].map((h) => (
                    <th className="py-2 pr-3" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {generated.rows.map((r) => (
                  <tr key={r.company} className="border-t border-line">
                    <td className="py-2 pr-3">{r.company}</td>
                    <td>{r.owner}</td>
                    {(['ok', '30', '60', '90'] as const).map((k) => (
                      <td key={k} className="tabular-nums">
                        {rm(r.buckets[k])}
                      </td>
                    ))}
                    <td className="font-semibold">{rm(r.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line font-semibold">
                  <td className="py-3" colSpan={2}>
                    Total
                  </td>
                  {(['ok', '30', '60', '90'] as const).map((k) => (
                    <td key={k}>{rm(generated.rows.reduce((s, r) => s + r.buckets[k], 0))}</td>
                  ))}
                  <td>{rm(generated.rows.reduce((s, r) => s + r.outstanding, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
