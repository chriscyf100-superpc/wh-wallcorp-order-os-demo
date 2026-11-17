import { DebtorAging } from './Collections.tsx'
import { ArrowRight, TrendingDown, TrendingUp } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { LADDER, ladderRate, monthKeyNow, monthLabel, monthProgress, nextRung, ownerMonth, teamYear, yearMonths, type TeamRow } from '../lib/commission.ts'
import { MonthBars } from './charts.tsx'
import { AgeingBar } from './meters.tsx'
import { AGE_COLOR } from '../lib/ageing.ts'
import { clientBuckets } from '../lib/payments.ts'
import { isToday, rm, whenLabel } from '../lib/format.ts'
import { AGEING_LABEL } from '../lib/labels.ts'
import { clientName, lineSummary } from '../lib/orders.ts'
import { orderTotal } from '../lib/pricing.ts'
import { useDesk } from '../lib/useDesk.ts'
import type { Ageing, Order, Stage, View } from '../lib/types.ts'
import { cn } from '../lib/utils.ts'
import { HoldPill, Note, SignalPill, StagePill } from './bits.tsx'

const THIS_YEAR = Number(monthKeyNow().slice(0, 4))
const YEARS = [THIS_YEAR, THIS_YEAR - 1]
// Every month of this year so far, newest first, then last year.
const MONTHS = [...yearMonths(THIS_YEAR).filter((key) => key <= monthKeyNow()).toReversed(), ...yearMonths(THIS_YEAR - 1).toReversed()]
const pct = (value: number, digits = 1): string => `${(value * 100).toFixed(digits)}%`
// Whole ringgit for headline figures; the Commission page keeps the sen.
const rm0 = (value: number): string => `RM ${Math.round(value).toLocaleString('en-MY')}`
const short = (value: number): string =>
  Math.abs(value) >= 1_000_000
    ? `RM ${(value / 1_000_000).toFixed(2)}m`
    : Math.abs(value) >= 10_000
      ? `RM ${(value / 1000).toFixed(1)}k`
      : rm0(value)

export function Dashboard({ onOpen }: { onOpen: (view: View) => void }) {
  const { orders, skus, clients, salespeople, commissionAdjustments, pulse, payments } = useDesk()
  const payWaiting = payments.filter((row) => row.status === 'reported')
  const [month, setMonth] = useState(MONTHS[0])
  const [scope, setScope] = useState<'month' | 'year'>('month')
  const [year, setYear] = useState(THIS_YEAR)
  const owner = ownerMonth(orders, clients, salespeople, commissionAdjustments, month)
  const live = month === monthKeyNow()
  const progress = monthProgress()
  const daysLeft = live ? progress.days - progress.day + 1 : 0
  const gap = Math.max(0, owner.target - owner.revenue)
  const yr = teamYear(orders, clients, salespeople, commissionAdjustments, year)
  const lastYr = teamYear(orders, clients, salespeople, commissionAdjustments, year - 1)

  const waiting = orders.filter((order) => order.stage === 'new').toSorted(byNewest)
  const holds = orders.filter((order) => order.stage === 'needs_approval').toSorted(byNewest)
  const holdValue = holds.reduce((sum, order) => sum + orderTotal(order.lines), 0)
  const withBoss = holds.filter((order) => order.hold?.status === 'escalated').length
  const thin = skus.filter((sku) => sku.stock !== 'enough')
  const todayAll = orders.filter((order) => isToday(order.createdAt)).toSorted(byNewest)

  const ar = receivables(clients)

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-ink-soft uppercase">
            {scope === 'month' && live ? (
              <>
                <span className="relative flex h-2 w-2" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-ok" />
                </span>
                Live · day {progress.day} of {progress.days}
              </>
            ) : scope === 'year' ? (
              year === THIS_YEAR ? 'Year to date' : 'Full year'
            ) : (
              'Closed month'
            )}
          </p>
          <h2 className="mt-1 font-display text-xl">Sales · {scope === 'month' ? monthLabel(month) : year}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-line bg-card p-0.5" role="group" aria-label="Target period">
            {(['month', 'year'] as const).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={scope === key}
                onClick={() => setScope(key)}
                className={cn('min-h-9 rounded-md px-3 text-sm font-medium', scope === key ? 'bg-brick text-white' : 'text-ink-soft hover:bg-sand')}
              >
                {key === 'month' ? 'Monthly' : 'Annual'}
              </button>
            ))}
          </div>
          {scope === 'month' ? (
            <select aria-label="Month" className="h-10 rounded-lg border border-line bg-card px-2 text-sm text-ink" value={month} onChange={(event) => setMonth(event.target.value)}>
              {MONTHS.map((key) => (
                <option key={key} value={key}>
                  {monthLabel(key)}
                </option>
              ))}
            </select>
          ) : (
            <select aria-label="Year" className="h-10 rounded-lg border border-line bg-card px-2 text-sm text-ink" value={year} onChange={(event) => setYear(Number(event.target.value))}>
              {YEARS.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      {scope === 'month' ? (
        <section className="rounded-2xl border border-line bg-card p-4 shadow-sm sm:p-5" aria-label="Team sales against the monthly target">
          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <div className="min-w-0">
              <p className="text-xs font-medium tracking-wide text-ink-soft uppercase">Team sales · WH1–WH5 · {live ? 'month to date' : 'month'}</p>
              <p className="mt-1 text-5xl font-semibold tracking-tight">{rm0(owner.revenue)}</p>
              <p className="mt-1 text-sm text-ink-soft tabular-nums">
                of {rm0(owner.target)} monthly target · <span className="font-medium text-ink">{pct(owner.attainment)}</span> {live ? 'so far' : 'attained'}
              </p>
              {live ? (
                <p className="mt-2 rounded-lg bg-palm-soft px-3 py-2 text-sm text-palm tabular-nums">
                  Only {progress.day} of {progress.days} days have gone, so by today the team should be at about{' '}
                  <span className="font-semibold">{pct(progress.elapsed, 0)}</span> ({short(owner.target * progress.elapsed)}). It is at{' '}
                  <span className="font-semibold">{pct(owner.attainment, 1)}</span> — running at{' '}
                  <span className="font-semibold">{pct(owner.projected ?? 0, 0)}</span> of pace.
                </p>
              ) : null}
              <LadderBar attainment={owner.attainment} projected={owner.projected} expected={live ? progress.elapsed : null} className="mt-4" />
            </div>
            <dl className="grid grid-cols-2 gap-3 self-start">
              <Mini
                label={live ? 'Month-end at this pace' : 'Month closed at'}
                value={pct(owner.projected ?? owner.attainment, 0)}
                detail={`${pct(ladderRate(owner.projected ?? owner.attainment), 1)} rung`}
                tone={(owner.projected ?? owner.attainment) >= 1 ? 'good' : (owner.projected ?? owner.attainment) >= 0.8 ? 'warn' : 'bad'}
              />
              <Mini
                label="Still to target"
                value={gap === 0 ? 'Hit' : short(gap)}
                detail={live && gap > 0 ? `${short(gap / daysLeft)} a day for ${daysLeft} days` : gap === 0 ? 'Target reached' : 'Month closed'}
              />
              <Mini label="Gross profit" value={short(owner.gp)} detail={`${pct(owner.gpPct)} margin`} />
              <Mini label="Commission accrued" value={short(owner.commission)} detail="Net, after CN clawbacks" />
            </dl>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-line bg-card p-4 shadow-sm sm:p-5" aria-label="Team sales against the annual target">
          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <div className="min-w-0">
              <p className="text-xs font-medium tracking-wide text-ink-soft uppercase">Team sales · WH1–WH5 · {year === THIS_YEAR ? 'Jan to today' : 'Jan–Dec'}</p>
              <p className="mt-1 text-5xl font-semibold tracking-tight">{short(yr.revenue)}</p>
              <p className="mt-1 text-sm text-ink-soft tabular-nums">
                of {short(yr.target)} annual target (12 × monthly) · <span className="font-medium text-ink">{pct(yr.attainment)}</span> of the year
              </p>
              {year === THIS_YEAR ? (
                <p className="mt-2 rounded-lg bg-palm-soft px-3 py-2 text-sm text-palm tabular-nums">
                  Target to date is {short(yr.targetToDate)} ({pct(yr.targetToDate / yr.target, 0)} of the year). The team is at{' '}
                  <span className="font-semibold">{pct(yr.attainmentToDate, 0)}</span> of that.
                </p>
              ) : null}
              <YearBar share={yr.attainment} expected={year === THIS_YEAR ? yr.targetToDate / yr.target : null} className="mt-4" />
            </div>
            <dl className="grid grid-cols-2 gap-3 self-start">
              <Mini
                label={year === THIS_YEAR ? 'Against target to date' : 'Year closed at'}
                value={pct(yr.attainmentToDate, 0)}
                detail={year === THIS_YEAR ? `${short(Math.max(0, yr.targetToDate - yr.revenue))} behind pace` : 'of the annual target'}
                tone={yr.attainmentToDate >= 1 ? 'good' : yr.attainmentToDate >= 0.8 ? 'warn' : 'bad'}
              />
              <Mini
                label={`vs ${year - 1}`}
                value={lastYr.revenue > 0 ? `${yr.revenue >= sameSpan(lastYr, yr) ? '+' : '−'}${pct(Math.abs(yr.revenue / Math.max(1, sameSpan(lastYr, yr)) - 1), 0)}` : '—'}
                detail={lastYr.revenue > 0 ? `${short(sameSpan(lastYr, yr))} same months last year` : 'No earlier year loaded'}
              />
              <Mini label="Gross profit" value={short(yr.gp)} detail={`${pct(yr.revenue > 0 ? yr.gp / yr.revenue : 0)} margin`} />
              <Mini label="Commission" value={short(yr.net)} detail="Net, all months" />
            </dl>
          </div>
          <MonthBars points={yr.months} lastYear={lastYr.months.some((row) => row.revenue > 0) ? lastYr.months : undefined} label={`Team sales by month, ${year}`} className="mt-5" height={190} />
        </section>
      )}

      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Pipeline"
          value={short(owner.pipeline)}
          detail={`${owner.pipelineCount} confirmed / preparing · GP ${rm0(owner.pipelineGp)}`}
          foot="Counts as sales once delivered"
          onClick={() => onOpen('board')}
        />
        <Kpi
          label="Overdue receivables"
          value={short(ar.overdue)}
          detail={`${ar.overdueAccounts} account${ar.overdueAccounts === 1 ? '' : 's'} · ${rm0(ar.buckets['90'])} at 90 days`}
          foot={payWaiting.length > 0 ? `${payWaiting.length} payment${payWaiting.length === 1 ? '' : 's'} reported, waiting for HQ (${rm0(payWaiting.reduce((sum, row) => sum + row.amount, 0))})` : `${pct(ar.total > 0 ? ar.overdue / ar.total : 0, 0)} of ${rm0(ar.total)} outstanding`}
          tone={ar.buckets['90'] > 0 ? 'bad' : ar.overdue > 0 ? 'warn' : undefined}
          onClick={() => onOpen(payWaiting.length > 0 ? 'payments' : 'clients')}
        />
        <Kpi
          label="HQ Hold"
          value={String(holds.length)}
          detail={`${rm0(holdValue)} waiting · ${withBoss} with the boss`}
          foot="Over the limit, or 60 / 90 days"
          tone={holds.length > 0 ? 'warn' : undefined}
          onClick={() => onOpen('hold')}
        />
        <Kpi
          label="Waiting to confirm"
          value={String(waiting.length)}
          detail={`${todayAll.length} WhatsApp order${todayAll.length === 1 ? '' : 's'} today`}
          foot={`${thin.length} yard signal${thin.length === 1 ? '' : 's'} low or out`}
          onClick={() => onOpen('confirm')}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Leaderboard team={owner.team} live={live} pulseName={pulse?.salesperson ?? null} pulseNonce={pulse?.nonce ?? 0} onOpen={() => onOpen('commission')} />
        <Ageing ar={ar} onOpen={() => onOpen('clients')} />
      </div>

      <DebtorAging />

      <Flow orders={orders} onOpen={onOpen} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Pile
          title="Waiting for a check"
          empty="Nothing new. A WhatsApp note will land here."
          orders={waiting.slice(0, 3)}
          skus={skus}
          clients={clients}
          onOpen={() => onOpen('confirm')}
          action="Open confirm"
        />
        <Pile
          title="HQ Hold"
          empty="No accounts are waiting on HQ."
          orders={holds.slice(0, 4)}
          skus={skus}
          clients={clients}
          onOpen={() => onOpen('hold')}
          action="Open HQ Hold"
        />
      </div>

      {thin.length > 0 ? (
        <section>
          <h3 className="text-sm font-medium text-ink-soft">Yard says it's thin</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {thin.map((sku) => (
              <li key={sku.id}>
                <button
                  type="button"
                  onClick={() => onOpen('stock')}
                  className="flex min-h-11 items-center gap-2 rounded-full border border-line bg-card py-1 pr-1 pl-3 text-sm hover:border-brick/40"
                >
                  <span>
                    {sku.name} <span className="text-ink-soft">{sku.nameZh}</span>
                  </span>
                  <SignalPill signal={sku.stock} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Note>
        Try it: on the phone, Boon (WH1) sends an order. Confirm it, then on the Board move it to Delivered. Boon's
        sales, GP and commission move here and on Commission. Receivables come from EMAS ageing; month-to-date EMAS
        invoices are demo figures. A RiseUp preview — not the live system.
      </Note>
    </div>
  )
}

/* ---------- headline pieces ---------- */

// Last year's sales over the same months that have gone this year (running month pro-rated).
function sameSpan(last: ReturnType<typeof teamYear>, now: ReturnType<typeof teamYear>): number {
  const { elapsed } = monthProgress()
  return now.months.reduce((sum, row, index) => {
    if (!row.open) return sum
    const prior = last.months[index]?.revenue ?? 0
    return sum + (row.partial ? prior * elapsed : prior)
  }, 0)
}

function YearBar({ share, expected, className }: { share: number; expected: number | null; className?: string }) {
  return (
    <div className={className}>
      <div className="relative h-3 rounded-full bg-paper-deep" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)} aria-label="Share of the annual target">
        <div className="absolute inset-y-0 left-0 rounded-full bg-brick transition-[width] duration-700 ease-out" style={{ width: `${Math.min(share, 1) * 100}%` }} />
        {expected !== null ? <span className="absolute -top-2 -bottom-2 w-0.5 rounded bg-palm" style={{ left: `${Math.min(expected, 1) * 100}%` }} aria-hidden="true" /> : null}
        {[0.25, 0.5, 0.75].map((q) => (
          <span key={q} className="absolute -top-1 -bottom-1 w-px bg-ink/20" style={{ left: `${q * 100}%` }} aria-hidden="true" />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-ink-soft" aria-hidden="true">
        <span>Jan</span>
        <span>Apr</span>
        <span>Jul</span>
        <span>Oct</span>
        <span>Dec</span>
      </div>
      {expected !== null ? <p className="text-xs text-ink-soft">Dark marker: where the team should be by today to finish the year on target.</p> : null}
    </div>
  )
}

// Progress to target on a 0–120% scale, with ticks at each ladder rung and a ghost marker for the month-end pace.
function LadderBar({ attainment, projected, expected, className }: { attainment: number; projected: number | null; expected?: number | null; className?: string }) {
  const scale = 1.2
  const at = Math.min(attainment / scale, 1)
  const pace = projected === null ? null : Math.min(projected / scale, 1)
  const rungs = LADDER.filter((band) => band.min > 0).toReversed()
  return (
    <div className={className}>
      <div
        className="relative h-3 rounded-full bg-paper-deep"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={120}
        aria-valuenow={Math.round(attainment * 100)}
        aria-label="Attainment against target"
      >
        {pace !== null && pace > at ? (
          <div className="absolute inset-y-0 left-0 rounded-full bg-brick/20" style={{ width: `${pace * 100}%` }} />
        ) : null}
        <div className="absolute inset-y-0 left-0 rounded-full bg-brick transition-[width] duration-700 ease-out" style={{ width: `${at * 100}%` }} />
        {expected != null ? (
          <span className="absolute -top-2 -bottom-2 w-0.5 rounded bg-palm" style={{ left: `${Math.min(expected / scale, 1) * 100}%` }} title="Where the team should be by today" aria-hidden="true" />
        ) : null}
        {rungs.map((band) => (
          <span
            key={band.min}
            className="absolute -top-1 -bottom-1 w-px bg-ink/30"
            style={{ left: `${(band.min / scale) * 100}%` }}
            aria-hidden="true"
          />
        ))}
      </div>
      <div className="relative mt-1.5 h-5 text-[11px] sm:h-8 text-ink-soft tabular-nums" aria-hidden="true">
        {rungs.map((band) => (
          <span key={band.min} className="absolute -translate-x-1/2 text-center leading-tight" style={{ left: `${(band.min / scale) * 100}%` }}>
            <span className="hidden sm:block">{Math.round(band.min * 100)}%</span>
            <span className="block font-medium text-ink">{(band.rate * 100).toFixed(0)}%</span>
          </span>
        ))}
      </div>
      <p className="text-xs text-ink-soft">
        Ticks are commission rungs at 80 / 90 / 100 / 110% of the monthly target (rate paid on GP).{expected != null ? ' Dark marker: where the team should be by today.' : ''}{projected !== null ? ' Light bar: where the month lands at today’s pace.' : ''}
      </p>
    </div>
  )
}

type Tone = 'good' | 'warn' | 'bad'
const TONE_TEXT: Record<Tone, string> = { good: 'text-ok', warn: 'text-amber', bad: 'text-rose' }

function Mini({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: Tone }) {
  return (
    <div className="min-w-0 rounded-xl bg-sand/50 px-3 py-2.5">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className={cn('text-2xl font-semibold tracking-tight', tone && TONE_TEXT[tone])}>{value}</dd>
      <dd className="text-xs leading-snug text-ink-soft">{detail}</dd>
    </div>
  )
}

function Kpi({
  label,
  value,
  detail,
  foot,
  tone,
  onClick,
}: {
  label: string
  value: string
  detail: string
  foot: string
  tone?: Tone
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-w-0 flex-col rounded-2xl border border-line bg-card p-4 text-left shadow-sm transition hover:border-brick/40"
    >
      <span className="flex items-center justify-between text-xs font-medium tracking-wide text-ink-soft uppercase">
        {label}
        <ArrowRight className="h-4 w-4 opacity-0 transition group-hover:opacity-60" aria-hidden="true" />
      </span>
      <span className={cn('mt-2 text-3xl font-semibold tracking-tight', tone && TONE_TEXT[tone])}>{value}</span>
      <span className="mt-1 text-sm text-ink-soft">{detail}</span>
      <span className="mt-auto pt-2 text-xs text-ink-soft/80">{foot}</span>
    </button>
  )
}

/* ---------- salespeople ---------- */

function Leaderboard({
  team,
  live,
  pulseName,
  pulseNonce,
  onOpen,
}: {
  team: TeamRow[]
  live: boolean
  pulseName: string | null
  pulseNonce: number
  onOpen: () => void
}) {
  const ranked = team.toSorted((a, b) => b.month.attainment - a.month.attainment)
  return (
    <section className="min-w-0 rounded-2xl border border-line bg-card p-4" aria-labelledby="team-heading">
      <div className="flex items-center justify-between gap-3">
        <h3 id="team-heading" className="font-display text-lg">
          Salespeople
        </h3>
        <button type="button" onClick={onOpen} className="min-h-10 text-sm font-medium text-brick hover:underline">
          Commission detail
        </button>
      </div>
      <ul className="mt-2 divide-y divide-line">
        {ranked.map((row) => {
          const { person, month: m, pipeline, projected } = row
          const up = nextRung(m.revenue, person.monthTarget)
          // Live month: how much on top of today's pace lifts the month-end rung. Closed month: plain gap.
          const paceUp = projected !== null ? LADDER.filter((band) => band.min > projected + 1e-9).at(-1) : undefined
          const extra = paceUp && projected !== null ? (paceUp.min - projected) * person.monthTarget : 0
          const flashing = pulseName === person.name
          const trend = projected ?? m.attainment
          return (
            <li key={flashing ? `${person.id}-${pulseNonce}` : person.id} className={cn('rounded-lg py-3', flashing && 'flash-row')}>
              <button type="button" onClick={onOpen} className="grid w-full grid-cols-[2.5rem_1fr_auto] items-center gap-x-3 gap-y-1 text-left">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-sand text-xs font-semibold text-brick-deep">{person.code}</span>
                <span className="min-w-0">
                  <span className="block font-medium">{person.name}</span>
                  <span className="block text-xs text-ink-soft tabular-nums">
                    {short(m.revenue)} of {short(person.monthTarget)} · GP {short(m.gp)}
                  </span>
                  {pipeline.count > 0 ? (
                    <span className="block text-xs text-ink-soft tabular-nums">
                      + {short(pipeline.sell)} in pipeline ({pipeline.count} order{pipeline.count === 1 ? '' : 's'})
                    </span>
                  ) : null}
                </span>
                <span className="text-right tabular-nums">
                  <span className="block font-semibold">{rm0(m.net)}</span>
                  <span className="block text-xs text-ink-soft">commission</span>
                </span>
                <span className="col-span-3 sm:col-start-2 sm:col-span-2">
                  <span className="flex items-center gap-2">
                    <span className="relative h-2 flex-1 rounded-full bg-paper-deep">
                      {projected !== null && projected > m.attainment ? (
                        <span className="absolute inset-y-0 left-0 rounded-full bg-brick/20" style={{ width: `${Math.min(projected / 1.2, 1) * 100}%` }} />
                      ) : null}
                      <span
                        className={cn('absolute inset-y-0 left-0 rounded-full transition-[width] duration-700', trend >= 1 ? 'bg-ok' : trend >= 0.8 ? 'bg-brick' : 'bg-amber')}
                        style={{ width: `${Math.min(m.attainment / 1.2, 1) * 100}%` }}
                      />
                      <span className="absolute -top-0.5 -bottom-0.5 w-px bg-ink/40" style={{ left: `${(1 / 1.2) * 100}%` }} aria-hidden="true" />
                    </span>
                    <span className="w-14 text-right text-sm font-medium tabular-nums">{pct(m.attainment, 0)}</span>
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-ink-soft">
                    {projected !== null ? (
                      <span className={cn('inline-flex items-center gap-1', TONE_TEXT[trend >= 1 ? 'good' : trend >= 0.8 ? 'warn' : 'bad'])}>
                        {trend >= 0.9 ? <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" /> : <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />}
                        Pace {pct(projected, 0)} → {pct(ladderRate(projected), 1)}
                      </span>
                    ) : (
                      <span>Rate {pct(m.rate, 1)}</span>
                    )}
                    {projected !== null ? (
                      paceUp ? (
                        <span>
                          +{short(extra)} this month for {pct(paceUp.rate, 0)}
                        </span>
                      ) : (
                        <span>Pacing at the 6% ceiling</span>
                      )
                    ) : up ? (
                      <span>
                        {short(up.gap)} short of the {pct(up.rate, 0)} rung
                      </span>
                    ) : (
                      <span>At the 6% ceiling</span>
                    )}
                    {!live && m.clawbacks < 0 ? <span className="text-rose">CN {rm0(m.clawbacks)}</span> : null}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/* ---------- receivables ---------- */

const AGE_ORDER: Ageing[] = ['ok', '30', '60', '90']

function receivables(clients: ReturnType<typeof useDesk>['clients']) {
  const buckets: Record<Ageing, number> = { ok: 0, '30': 0, '60': 0, '90': 0 }
  for (const client of clients) {
    const own = clientBuckets(client)
    for (const key of AGE_ORDER) buckets[key] += own[key]
  }
  const overdueList = clients
    .filter((client) => client.ageing !== 'ok' && client.outstanding > 0)
    .toSorted((a, b) => Number(b.ageing) - Number(a.ageing) || b.outstanding - a.outstanding)
  const overLimit = clients.filter((client) => client.creditLimit > 0 && client.outstanding > client.creditLimit)
  const total = AGE_ORDER.reduce((sum, key) => sum + buckets[key], 0)
  return {
    buckets,
    total,
    overdue: total - buckets.ok,
    overdueAccounts: overdueList.length,
    overdueList,
    overLimit,
  }
}

function Ageing({ ar, onOpen }: { ar: ReturnType<typeof receivables>; onOpen: () => void }) {
  return (
    <section className="min-w-0 rounded-2xl border border-line bg-card p-4" aria-labelledby="ar-heading">
      <div className="flex items-center justify-between gap-3">
        <h3 id="ar-heading" className="font-display text-lg">
          Belum bayar
        </h3>
        <button type="button" onClick={onOpen} className="min-h-10 text-sm font-medium text-brick hover:underline">
          Clients
        </button>
      </div>
      <p className="text-sm text-ink-soft tabular-nums">{rm0(ar.total)} outstanding · ageing from EMAS</p>
      <AgeingBar buckets={ar.buckets} className="mt-3" />
      <dl className="mt-3 grid gap-1 text-sm">
        {AGE_ORDER.map((key) => (
          <div key={key} className="flex items-center justify-between gap-2 rounded-lg px-1 py-1">
            <dt className="flex items-center gap-2 text-ink-soft">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: AGE_COLOR[key] }} aria-hidden="true" />
              {AGEING_LABEL[key]}
            </dt>
            <dd className="font-medium tabular-nums">{short(ar.buckets[key])}</dd>
          </div>
        ))}
      </dl>
      {ar.overdueList.length > 0 ? (
        <>
          <h4 className="mt-4 text-xs font-medium tracking-wide text-ink-soft uppercase">Chase first</h4>
          <ul className="mt-1 divide-y divide-line text-sm">
            {ar.overdueList.slice(0, 4).map((client) => (
              <li key={client.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate">{client.company}</span>
                <span className="flex shrink-0 items-center gap-2 tabular-nums">
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', client.ageing === '90' ? 'bg-rose-soft text-rose' : client.ageing === '60' ? 'bg-amber-soft text-amber' : 'bg-sand text-gold')}>
                    {client.ageing}d
                  </span>
                  {rm0(client.outstanding)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {ar.overLimit.length > 0 ? (
        <p className="mt-3 text-xs text-amber">
          {ar.overLimit.length} account{ar.overLimit.length === 1 ? '' : 's'} already over the credit limit. New orders go to HQ Hold.
        </p>
      ) : null}
    </section>
  )
}

/* ---------- order flow ---------- */

const FLOW: { stage: Stage; label: string; view: View }[] = [
  { stage: 'new', label: 'To confirm', view: 'confirm' },
  { stage: 'needs_approval', label: 'HQ Hold', view: 'hold' },
  { stage: 'confirmed', label: 'Confirmed', view: 'board' },
  { stage: 'preparing', label: 'Preparing', view: 'board' },
  { stage: 'delivered', label: 'Delivered', view: 'board' },
]

function Flow({ orders, onOpen }: { orders: Order[]; onOpen: (view: View) => void }) {
  const month = monthKeyNow()
  return (
    <section aria-labelledby="flow-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="flow-heading" className="font-display text-lg">
          Order flow
        </h3>
        <p className="text-xs text-ink-soft">WhatsApp → credit → SO → yard → delivered (= invoiced, counts for commission)</p>
      </div>
      <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {FLOW.map((step, index) => {
          const rows = orders.filter(
            (order) =>
              order.stage === step.stage &&
              (step.stage !== 'delivered' || (order.invoicedAt ?? order.createdAt).slice(0, 7) === month),
          )
          const value = rows.reduce((sum, order) => sum + orderTotal(order.lines), 0)
          return (
            <li key={step.stage} className={cn(index === FLOW.length - 1 && 'col-span-2 sm:col-span-1')}>
              <button
                type="button"
                onClick={() => onOpen(step.view)}
                className={cn(
                  'relative flex h-full w-full flex-col rounded-xl border p-3 text-left transition hover:border-brick/40',
                  step.stage === 'delivered' ? 'border-ok/30 bg-ok-soft/60' : step.stage === 'needs_approval' && rows.length > 0 ? 'border-amber/30 bg-amber-soft/60' : 'border-line bg-card',
                )}
              >
                <span className="text-xs font-medium text-ink-soft">
                  {index + 1}. {step.label}
                  {step.stage === 'delivered' ? ' · this month' : ''}
                </span>
                <span className="mt-1 text-2xl font-semibold">{rows.length}</span>
                <span className="text-xs text-ink-soft tabular-nums">{short(value)}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/* ---------- queues ---------- */

function Pile({
  title,
  empty,
  orders,
  skus,
  clients,
  onOpen,
  action,
}: {
  title: string
  empty: string
  orders: Order[]
  skus: ReturnType<typeof useDesk>['skus']
  clients: ReturnType<typeof useDesk>['clients']
  onOpen: () => void
  action: string
}): ReactNode {
  return (
    <section className="min-w-0 rounded-2xl border border-line bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-lg">{title}</h3>
        <button type="button" onClick={onOpen} className="min-h-10 text-sm font-medium text-brick hover:underline">
          {action}
        </button>
      </div>
      {orders.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {orders.map((order) => (
            <li key={order.id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-ink-soft">
                    {order.id} · {order.salesperson} · {whenLabel(order.createdAt)}
                  </p>
                  <p className="font-medium">{clientName(clients, order.clientId)}</p>
                  <p className="truncate text-sm text-ink-soft">{lineSummary(order, skus)}</p>
                </div>
                <div className="shrink-0 text-right">
                  {order.hold ? <HoldPill status={order.hold.status} /> : <StagePill stage={order.stage} />}
                  <p className="mt-1 text-sm font-medium tabular-nums">{rm(orderTotal(order.lines))}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function byNewest(a: Order, b: Order): number {
  if (a.createdAt === b.createdAt) return 0
  return a.createdAt < b.createdAt ? 1 : -1
}
