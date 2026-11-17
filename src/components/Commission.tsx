import { useState } from 'react'
import { EARLY_PAY_DAYS, EARLY_PAY_RATE, LADDER, monthKeyNow, monthLabel, monthProgress, personMonth, personPipeline, personYear, projectAttainment, summariseYear, sumMonths, teamYear, timingLabel, yearMonths } from '../lib/commission.ts'
import { MonthBars, RankBars, shortRm } from './charts.tsx'
import type { PersonMonth } from '../lib/commission.ts'
import { SHEET, SHEET_MONTH } from '../lib/commissionSeed.ts'
import { rm } from '../lib/format.ts'
import type { Salesperson } from '../lib/types.ts'
import { useDesk } from '../lib/useDesk.ts'
import { cn } from '../lib/utils.ts'
import { Note } from './bits.tsx'

const LIVE_MONTHS = yearMonths(Number(monthKeyNow().slice(0, 4))).filter((key) => key <= monthKeyNow() && key !== SHEET_MONTH)

type Tab = 'sheet' | 'live' | 'perf'

const pct = (value: number, digits = 2): string => `${(value * 100).toFixed(digits)}%`

export function Commission() {
  const { orders, clients, salespeople, commissionAdjustments, pulse } = useDesk()
  const [tab, setTab] = useState<Tab>('live')
  const [liveMonth, setLiveMonth] = useState(LIVE_MONTHS[LIVE_MONTHS.length - 1])
  const [picked, setPicked] = useState<string | null>(null)

  const month = tab === 'sheet' ? SHEET_MONTH : liveMonth
  const showPipeline = tab === 'live' && month === monthKeyNow()
  const rows = salespeople.map((person) => ({
    person,
    month: personMonth(orders, clients, person, commissionAdjustments, month),
    pipeline: showPipeline ? personPipeline(orders, person) : null,
  }))
  const rowsWithPace = rows.map((row) => ({ ...row, pace: showPipeline ? projectAttainment(row.month.attainment, month) : null }))
  const total = sumMonths(rows.map((row) => row.month))
  const pipelineTotal = rows.reduce((sum, row) => sum + (row.pipeline?.sell ?? 0), 0)
  const selected = rows.find((row) => row.person.id === picked) ?? null
  const boon = rows.find((row) => row.person.code === 'WH1')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <TabButton active={tab === 'live'} onClick={() => { setTab('live'); setPicked(null) }}>
          Live · WH1–WH5
        </TabButton>
        <TabButton active={tab === 'perf'} onClick={() => { setTab('perf'); setPicked(null) }}>
          Performance · month vs year
        </TabButton>
        <TabButton active={tab === 'sheet'} onClick={() => { setTab('sheet'); setPicked(null) }}>
          Sep ’26 sheet (HQ photo)
        </TabButton>
        {tab === 'perf' ? null : tab === 'live' ? (
          <label className="ml-auto flex items-center gap-2 text-sm text-ink-soft">
            Month
            <select
              className="rounded-lg border border-line bg-card px-2 py-1.5 text-sm text-ink"
              value={liveMonth}
              onChange={(event) => setLiveMonth(event.target.value)}
            >
              {LIVE_MONTHS.map((key) => (
                <option key={key} value={key}>
                  {monthLabel(key)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="ml-auto text-sm text-ink-soft">Month: {monthLabel(SHEET_MONTH)} · frozen</span>
        )}
      </div>

      {tab === 'perf' ? <Performance /> : null}
      {tab !== 'perf' ? (
        <>
      {tab === 'sheet' && boon ? <BoonCallout data={boon.month} target={boon.person.monthTarget} /> : null}
      {tab === 'live' ? (
        <Note>
          Revenue = invoices already in EMAS (demo figures) + Delivered orders on the board, counted in the month
          invoiced. Delivering an order invoices it that day, so its salesperson's row moves straight away.
          {showPipeline ? ' Pipeline is Confirmed / Preparing orders with prices locked: not commission yet.' : ''}
          {showPipeline ? ' Pace is attainment projected to month-end at the current run-rate.' : ''}
        </Note>
      ) : null}

      <p className="text-xs text-ink-soft sm:hidden">Swipe the table sideways to see every column.</p>
      <div
        className="overflow-x-auto rounded-2xl border border-line bg-card focus-visible:outline-2 focus-visible:outline-brick"
        tabIndex={0}
        role="region"
        aria-label="Commission by salesperson, scrolls sideways"
      >
        <table className={cn('w-full text-left text-sm tabular-nums', showPipeline ? 'min-w-[76rem]' : 'min-w-[64rem]')}>
          <thead className="border-b border-line text-xs text-ink-soft uppercase">
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2 text-right">Target</th>
              <th className="px-3 py-2 text-right">Revenue</th>
              <th className="px-3 py-2 text-right">Attain.</th>
              {showPipeline ? <th className="px-3 py-2 text-right">Pace</th> : null}
              <th className="px-3 py-2 text-right">Rate</th>
              <th className="px-3 py-2 text-right">GP</th>
              <th className="px-3 py-2 text-right">Base RM</th>
              <th className="px-3 py-2 text-right">Early-pay RM</th>
              <th className="px-3 py-2 text-right">Clawback</th>
              <th className="px-3 py-2 text-right">Net RM</th>
              {showPipeline ? <th className="px-3 py-2 text-right">Pipeline</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rowsWithPace.map(({ person, month: row, pipeline, pace }) => (
              <PersonRow
                key={pulse?.salesperson === person.name ? `${person.id}-${pulse.nonce}` : person.id}
                person={person}
                row={row}
                pace={showPipeline ? pace : undefined}
                pipeline={pipeline}
                flash={pulse?.salesperson === person.name}
                active={picked === person.id}
                onPick={() => setPicked(picked === person.id ? null : person.id)}
              />
            ))}
          </tbody>
          <tfoot className="border-t border-line bg-sand/50 font-medium">
            <tr>
              <td className="px-3 py-2" colSpan={3}>
                Total
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap">{rm(total.revenue)}</td>
              <td className="px-3 py-2" colSpan={showPipeline ? 3 : 2} />
              <td className="px-3 py-2 text-right whitespace-nowrap">{rm(total.gp)}</td>
              <td className="px-3 py-2 text-right whitespace-nowrap">{rm(total.baseCommission)}</td>
              <td className="px-3 py-2 text-right whitespace-nowrap">{rm(total.earlyPayBonus)}</td>
              <td className="px-3 py-2 text-right whitespace-nowrap">{rm(total.clawbacks)}</td>
              <td className="px-3 py-2 text-right whitespace-nowrap">{rm(total.net)}</td>
              {showPipeline ? <td className="px-3 py-2 text-right whitespace-nowrap">{rm(pipelineTotal)}</td> : null}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-ink-soft">Click a row for the breakdown.</p>

      {selected ? <DrillDown person={selected.person} data={selected.month} month={month} /> : null}
      {tab === 'sheet' ? <SheetCheck /> : null}
      <Legend />
        </>
      ) : null}
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-sm font-medium',
        active ? 'border-brick bg-brick text-paper' : 'border-line bg-card text-ink-soft hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

function PersonRow({
  person,
  row,
  pace,
  pipeline,
  flash,
  active,
  onPick,
}: {
  person: Salesperson
  row: PersonMonth
  pace?: number | null
  pipeline: { sell: number; count: number } | null
  flash: boolean
  active: boolean
  onPick: () => void
}) {
  const empty = row.revenue === 0
  const dash = <span className="text-ink-soft">—</span>
  return (
    <tr
      className={cn('cursor-pointer align-top hover:bg-sand/40', active && 'bg-sand/60', flash && 'just-landed')}
      onClick={onPick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onPick()
        }
      }}
      tabIndex={0}
      aria-expanded={active}
    >
      <td className="px-3 py-2 font-medium">{person.code}</td>
      <td className="px-3 py-2">
        {person.name}
        {person.exception ? <span className="block text-xs text-amber">HQ exception</span> : null}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">{person.monthTarget > 0 ? rm(person.monthTarget) : dash}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap">{empty ? dash : rm(row.revenue)}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap">{empty || person.monthTarget <= 0 ? dash : pct(row.attainment)}</td>
      {pace !== undefined ? <td className="px-3 py-2 text-right whitespace-nowrap text-ink-soft">{pace === null ? dash : pct(pace, 0)}</td> : null}
      <td className="px-3 py-2 text-right whitespace-nowrap">{empty || person.exception ? dash : pct(row.rate, 1)}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap">{empty ? dash : rm(row.gp)}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap">{empty || person.exception ? dash : rm(row.baseCommission)}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap">{row.earlyPayBonus === 0 ? dash : rm(row.earlyPayBonus)}</td>
      <td className={cn('px-3 py-2 text-right whitespace-nowrap', row.clawbacks < 0 && 'text-rose')}>
        {row.clawbacks === 0 ? dash : rm(row.clawbacks)}
      </td>
      <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{empty || person.exception ? dash : rm(row.net)}</td>
      {pipeline ? (
        <td className="px-3 py-2 text-right whitespace-nowrap text-ink-soft">
          {pipeline.count === 0 ? dash : rm(pipeline.sell)}
          {pipeline.count > 0 ? <span className="block text-xs">{pipeline.count} order{pipeline.count === 1 ? '' : 's'}</span> : null}
        </td>
      ) : null}
    </tr>
  )
}

function BoonCallout({ data, target }: { data: PersonMonth; target: number }) {
  return (
    <div className="rounded-2xl border border-brick/30 bg-brick/5 px-4 py-3 text-sm leading-6">
      <p className="text-xs font-semibold tracking-wide text-brick uppercase">Worked example · WH1 Boon · Sep ’26</p>
      <p className="mt-1">
        Revenue {rm(data.revenue)} ÷ target {rm(target)} = <strong>{pct(data.attainment)}</strong> attainment → the
        100% to under 110% rung → <strong>{pct(data.rate, 0)}</strong> on GP {rm(data.gp)} ={' '}
        <strong>{rm(data.baseCommission)}</strong>. Not {pct(data.rate, 0)} of sales.
      </p>
    </div>
  )
}

function DrillDown({ person, data, month }: { person: Salesperson; data: PersonMonth; month: string }) {
  return (
    <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
      <header>
        <h2 className="font-display text-lg leading-tight tracking-tight">
          {person.code} · {person.name} · {monthLabel(month)}
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          {person.monthTarget > 0
            ? `${rm(data.revenue)} ÷ ${rm(person.monthTarget)} = ${pct(data.attainment)} attainment → ${pct(data.rate, 1)} on GP ${rm(data.gp)}`
            : 'No target set for this person.'}
        </p>
        {person.exception ? (
          <p className="mt-2 rounded-lg bg-amber-soft px-3 py-2 text-sm text-amber">
            {person.exception}. The ladder would give {pct(data.rate, 1)} × GP = {rm(data.impliedBase)}, but nothing is
            paid until HQ decides.
          </p>
        ) : null}
        {data.costMissingCount > 0 ? (
          <p className="mt-2 rounded-lg bg-amber-soft px-3 py-2 text-sm text-amber">
            {data.costMissingCount} order(s) have no locked cost on some line. They count in revenue but their GP is left out.
          </p>
        ) : null}
      </header>

      {data.lines.length === 0 ? (
        <p className="text-sm text-ink-soft">No invoiced orders in this month.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm tabular-nums">
            <thead className="border-b border-line text-xs text-ink-soft uppercase">
              <tr>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2 text-right">Sell</th>
                <th className="px-3 py-2 text-right">Cost</th>
                <th className="px-3 py-2 text-right">GP</th>
                <th className="px-3 py-2">Payment</th>
                <th className="px-3 py-2 text-right">Early-pay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.lines.map((line) => (
                <tr key={line.ref + line.customer}>
                  <td className="px-3 py-2 whitespace-nowrap">{line.ref}</td>
                  <td className="px-3 py-2">{line.customer}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{rm(line.sell)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{line.costMissing ? 'missing' : rm(line.cost)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{line.costMissing ? '—' : rm(line.gp)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{timingLabel(line.timing)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{line.earlyPay === 0 ? '—' : rm(line.earlyPay)}</td>
                </tr>
              ))}
              {data.adjustments.map((adj) => (
                <tr key={adj.id} className="bg-rose-soft/40">
                  <td className="px-3 py-2 whitespace-nowrap">Credit note</td>
                  <td className="px-3 py-2" colSpan={4}>
                    {adj.reason}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-ink-soft">Clawback</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap text-rose">{rm(adj.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <dl className="grid gap-2 text-sm sm:grid-cols-4">
        <Figure label="Base commission" value={rm(data.baseCommission)} />
        <Figure label="Early-pay add-on" value={rm(data.earlyPayBonus)} />
        <Figure label="CN clawbacks" value={rm(data.clawbacks)} tone={data.clawbacks < 0 ? 'text-rose' : undefined} />
        <Figure label="Net commission" value={rm(data.net)} strong />
      </dl>
    </section>
  )
}

function Figure({ label, value, tone, strong }: { label: string; value: string; tone?: string; strong?: boolean }) {
  return (
    <div className="rounded-xl bg-sand/50 px-3 py-2">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className={cn('font-medium', strong && 'text-base font-semibold', tone)}>{value}</dd>
    </div>
  )
}

// Recomputed base commission against what the sheet printed, so the meeting can see they agree.
function SheetCheck() {
  const { salespeople, orders, clients, commissionAdjustments } = useDesk()
  const items = SHEET.filter((row) => row.sheetCommission !== null).map((row) => {
    const person = salespeople.find((item) => item.code === row.code)
    const base = person ? personMonth(orders, clients, person, commissionAdjustments, SHEET_MONTH).baseCommission : 0
    return { code: row.code, name: row.name, sheet: row.sheetCommission ?? 0, base }
  })
  const sheetTotal = Math.round(items.reduce((sum, row) => sum + row.sheet, 0) * 100) / 100
  const matched = items.filter((row) => Math.abs(row.base - row.sheet) < 0.005).length
  const baseTotal = Math.round(items.reduce((sum, row) => sum + row.base, 0) * 100) / 100
  return (
    <Note>
      <strong>Checks against the sheet.</strong> Base commission here is GP × ladder rate. It matches the printed
      Commission column for {matched} of {items.length} people ({rm(baseTotal)} against {rm(sheetTotal)}). Demo scoped to WH1–WH5 only (Boon, Geh, Lye Seng, Jt, Han).
      Boon's payment days and all credit notes are demo figures; the sheet has neither.
    </Note>
  )
}

function Legend() {
  return (
    <div className="grid gap-3 rounded-2xl border border-line bg-card p-4 text-sm md:grid-cols-3">
      <div>
        <h3 className="font-medium">Rate ladder (attainment = revenue ÷ target)</h3>
        <ul className="mt-1 space-y-0.5 text-ink-soft">
          {LADDER.toReversed().map((band) => (
            <li key={band.min}>
              {band.label}: <span className="text-ink">{pct(band.rate, 1)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-ink-soft">6% is the ceiling.</p>
      </div>
      <div>
        <h3 className="font-medium">Early-pay add-on</h3>
        <ul className="mt-1 space-y-0.5 text-ink-soft">
          <li>
            Paid within {EARLY_PAY_DAYS} days of invoice (day 0 to day {EARLY_PAY_DAYS}): <span className="text-ink">+{pct(EARLY_PAY_RATE, 0)} on GP</span>
          </li>
          <li>Paid after day {EARLY_PAY_DAYS}, or unpaid: 0</li>
        </ul>
      </div>
      <div>
        <h3 className="font-medium">On GP, not revenue</h3>
        <p className="mt-1 text-ink-soft">
          GP = sell − cost from the prices locked at Price Desk. Both the ladder rate and the early-pay add-on are paid on
          GP. Credit notes come off as negative clawback rows. Net = base + early-pay + clawbacks.
        </p>
      </div>
    </div>
  )
}

/* ---------- performance: month vs year ---------- */

function Performance() {
  const { orders, clients, salespeople, commissionAdjustments } = useDesk()
  const thisYear = Number(monthKeyNow().slice(0, 4))
  const [who, setWho] = useState<string>('team')
  const [year, setYear] = useState(thisYear)
  const people = salespeople
  const series = (y: number) =>
    who === 'team'
      ? teamYear(orders, clients, people, commissionAdjustments, y)
      : summariseYear(personYear(orders, clients, people.find((p) => p.id === who) ?? people[0], commissionAdjustments, y), y)
  const now = series(year)
  const last = series(year - 1)
  const open = now.months.filter((m) => m.open)
  const closed = open.filter((m) => !m.partial)
  const best = closed.toSorted((a, b) => b.attainment - a.attainment)[0]
  const hits = closed.filter((m) => m.attainment >= 1).length
  const lastSpan = now.months.reduce((sum, m, i) => (m.open ? sum + (m.partial ? (last.months[i]?.revenue ?? 0) * monthProgress().elapsed : (last.months[i]?.revenue ?? 0)) : sum), 0)
  const growth = lastSpan > 0 ? now.revenue / lastSpan - 1 : null
  const personName = who === 'team' ? 'Team WH1–WH5' : (people.find((p) => p.id === who)?.name ?? '')
  const grid = people.map((person) => ({ person, year: summariseYear(personYear(orders, clients, person, commissionAdjustments, year), year) }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Salesperson">
          {[{ id: 'team', label: 'Team' }, ...people.map((p) => ({ id: p.id, label: `${p.code} ${p.name}` }))].map((row) => (
            <button
              key={row.id}
              type="button"
              aria-pressed={who === row.id}
              onClick={() => setWho(row.id)}
              className={cn('min-h-9 rounded-full border px-3 text-sm', who === row.id ? 'border-brick bg-brick text-white' : 'border-line bg-card text-ink-soft hover:bg-sand')}
            >
              {row.label}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-sm text-ink-soft">
          Year
          <select className="rounded-lg border border-line bg-card px-2 py-1.5 text-sm text-ink" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[thisYear, thisYear - 1].map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <PerfStat label={year === thisYear ? 'Sales, year to date' : `Sales, ${year}`} value={shortRm(now.revenue)} detail={`${pct(now.attainment, 0)} of the ${shortRm(now.target)} year target`} />
        <PerfStat
          label="Against target to date"
          value={pct(now.attainmentToDate, 0)}
          detail={year === thisYear ? `Target so far ${shortRm(now.targetToDate)}` : 'Full year'}
          tone={now.attainmentToDate >= 1 ? 'good' : now.attainmentToDate >= 0.8 ? 'warn' : 'bad'}
        />
        <PerfStat label={`vs ${year - 1}, same months`} value={growth === null ? '—' : `${growth >= 0 ? '+' : '−'}${pct(Math.abs(growth), 0)}`} detail={growth === null ? 'No earlier year' : `${shortRm(lastSpan)} last year`} tone={growth === null ? undefined : growth >= 0 ? 'good' : 'bad'} />
        <PerfStat label="Months on target" value={`${hits} of ${closed.length}`} detail={best ? `Best: ${monthLabel(best.month)} at ${pct(best.attainment, 0)}` : 'No closed month yet'} />
      </dl>

      <section className="rounded-2xl border border-line bg-card p-4">
        <h3 className="font-display text-base">{personName} · sales by month</h3>
        <p className="text-sm text-ink-soft">Bars are {year}; the line is the same month in {year - 1}. The dark line is the monthly target. Hover a month for numbers.</p>
        <MonthBars points={now.months} lastYear={last.months.some((m) => m.revenue > 0) ? last.months : undefined} label={`${personName} sales by month, ${year} vs ${year - 1}`} className="mt-3" height={220} />
      </section>

      <div className="grid gap-4 2xl:grid-cols-[1.6fr_1fr]">
        <section className="min-w-0 rounded-2xl border border-line bg-card p-4" aria-labelledby="grid-heading">
          <h3 id="grid-heading" className="font-display text-base">
            Attainment by month · {year}
          </h3>
          <p className="text-sm text-ink-soft">Each cell is sales ÷ that month’s target. Darker = closer to (or past) target.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[40rem] border-separate border-spacing-0.5 text-center text-xs tabular-nums">
              <thead>
                <tr className="text-ink-soft">
                  <th className="pr-2 text-left font-medium">Person</th>
                  {yearMonths(year).map((m) => (
                    <th key={m} className="font-medium">
                      {monthLabel(m).slice(0, 3)}
                    </th>
                  ))}
                  <th className="pl-2 font-medium">YTD</th>
                </tr>
              </thead>
              <tbody>
                {grid.map(({ person, year: y }) => (
                  <tr key={person.id}>
                    <th className="pr-2 text-left font-medium whitespace-nowrap">
                      <button type="button" className="hover:underline" onClick={() => setWho(person.id)}>
                        {person.code} {person.name}
                      </button>
                    </th>
                    {y.months.map((m) => (
                      <td
                        key={m.month}
                        title={`${person.name}, ${monthLabel(m.month)}: ${m.open ? `${shortRm(m.revenue)} · ${pct(m.attainment, 0)}` : 'not yet'}`}
                        className={cn('h-8 rounded', m.open ? heat(m.attainment) : 'bg-paper text-ink-soft/50', m.partial && 'ring-1 ring-ink/30 ring-inset')}
                      >
                        {m.open ? Math.round(m.attainment * 100) : '·'}
                      </td>
                    ))}
                    <td className="pl-2 font-semibold">{pct(y.attainmentToDate, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-soft">
            <span>% of monthly target:</span>
            {[
              ['< 60', 0.5],
              ['60–79', 0.7],
              ['80–99', 0.9],
              ['100+', 1.05],
            ].map(([label, v]) => (
              <span key={label as string} className={cn('rounded px-1.5 py-0.5', heat(v as number))}>
                {label as string}
              </span>
            ))}
            <span>· outlined = month still running</span>
          </p>
        </section>

        <section className="min-w-0 rounded-2xl border border-line bg-card p-4">
          <h3 className="font-display text-base">Year to date vs target</h3>
          <p className="mb-3 text-sm text-ink-soft">Line marks 100% of target to date.</p>
          <RankBars
            rows={grid
              .map(({ person, year: y }) => ({ key: person.id, label: `${person.code} ${person.name}`, value: y.attainmentToDate, sub: shortRm(y.revenue) }))
              .toSorted((a, b) => b.value - a.value)}
            format={(v) => pct(v, 0)}
            marker={{ value: 1, label: '100% of target to date' }}
          />
          <h3 className="mt-5 font-display text-base">Commission earned · {year}</h3>
          <RankBars rows={grid.map(({ person, year: y }) => ({ key: person.id, label: `${person.code} ${person.name}`, value: y.net })).toSorted((a, b) => b.value - a.value)} format={shortRm} />
        </section>
      </div>
    </div>
  )
}

// Single-hue sequential ramp (brand blue), light → dark; text flips to white on the dark steps.
function heat(attainment: number): string {
  if (attainment >= 1) return 'bg-[#274799] text-white'
  if (attainment >= 0.8) return 'bg-[#0768cb] text-white'
  if (attainment >= 0.6) return 'bg-[#9ec7ef] text-ink'
  return 'bg-[#d8e9fb] text-ink'
}

function PerfStat({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <dt className="text-xs font-medium tracking-wide text-ink-soft uppercase">{label}</dt>
      <dd className={cn('mt-1 font-display text-2xl tabular-nums', tone === 'good' && 'text-ok', tone === 'warn' && 'text-amber', tone === 'bad' && 'text-rose')}>{value}</dd>
      <dd className="text-sm text-ink-soft">{detail}</dd>
    </div>
  )
}
