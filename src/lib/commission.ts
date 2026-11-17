import { lockedTotals } from './pricedesk.ts'
import { SHEET, SHEET_MONTH, baselineLines, monthKeyNow, monthProgress, sheetLines } from './commissionSeed.ts'
import type { Client, CommissionAdjustment, Order, Salesperson } from './types.ts'

// Ladder from the HEIC card. Highest band first. Rate is paid on GP, not on sales.
export const LADDER: { min: number; rate: number; label: string }[] = [
  { min: 1.1, rate: 0.06, label: '110% and above' },
  { min: 1.0, rate: 0.05, label: '100% to under 110%' },
  { min: 0.9, rate: 0.04, label: '90% to under 100%' },
  { min: 0.8, rate: 0.03, label: '80% to under 90%' },
  { min: 0, rate: 0.025, label: 'Under 80%' },
]

// Early-pay add-on, also on GP. Flat +3% when the customer pays within 14 calendar days of the invoice date
// (day 0 through day 14 inclusive). Later or unpaid earns nothing.
export const EARLY_PAY_DAYS = 14
export const EARLY_PAY_RATE = 0.03

// Guards float noise such as 0.7999999999 when revenue / target should be exactly 0.8.
const EPS = 1e-9

export function ladderRate(attainment: number): number {
  if (!Number.isFinite(attainment)) return LADDER[LADDER.length - 1].rate
  return (LADDER.find((band) => attainment + EPS >= band.min) ?? LADDER[LADDER.length - 1]).rate
}

export type PayTiming = { days: number } | 'unpaid' | 'n/a'

export function earlyRate(timing: PayTiming): number {
  return typeof timing === 'object' && timing.days >= 0 && timing.days <= EARLY_PAY_DAYS ? EARLY_PAY_RATE : 0
}

export function timingLabel(timing: PayTiming): string {
  if (timing === 'unpaid') return 'Unpaid'
  if (timing === 'n/a') return 'No pay data'
  return timing.days === 1 ? 'Paid in 1 day' : `Paid in ${timing.days} days`
}

export interface CommissionLine {
  ref: string
  customer: string
  sell: number
  cost: number
  gp: number
  // Lock had no cost on some line. Revenue still counts, but GP is left out rather than guessed.
  costMissing: boolean
  timing: PayTiming
  earlyPay: number
}

export interface PersonMonth {
  revenue: number
  cost: number
  gp: number
  attainment: number
  rate: number
  baseCommission: number
  earlyPayBonus: number
  clawbacks: number
  net: number
  lines: CommissionLine[]
  adjustments: CommissionAdjustment[]
  costMissingCount: number
  // What the ladder would pay on GP if the person were not held out of payout.
  impliedBase: number
}

export const monthKeyOf = (date: string): string => date.slice(0, 7)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number)
  return `${MONTHS[month - 1]} ${year}`
}

// Whole calendar days from one YYYY-MM-DD date to another (time of day is ignored).
export function daysBetween(fromDate: string, toDate: string): number {
  const utc = (date: string): number => {
    const [year, month, day] = date.slice(0, 10).split('-').map(Number)
    return Date.UTC(year, month - 1, day)
  }
  return Math.round((utc(toDate) - utc(fromDate)) / 86_400_000)
}

const r2 = (value: number): number => Math.round((value + Math.sign(value) * 1e-9) * 100) / 100

export function paymentTiming(order: Order): PayTiming {
  if (!order.paidAt) return 'unpaid'
  return { days: daysBetween(order.invoicedAt ?? localDate(order.createdAt), order.paidAt) }
}

// Revenue basis for live orders: Delivered orders with every line locked at Price Desk, counted in the month
// they were invoiced. An order with no invoice date falls back to the month it was raised.
export function ordersToLines(orders: Order[], clients: Client[], person: Salesperson, month: string): CommissionLine[] {
  const lines: CommissionLine[] = []
  for (const order of orders) {
    if (order.salesperson !== person.name || order.stage !== 'delivered') continue
    if (monthKeyOf(order.invoicedAt ?? localDate(order.createdAt)) !== month) continue
    const totals = lockedTotals(order)
    if (!totals) continue
    const customer = clients.find((client) => client.id === order.clientId)?.company ?? 'Unknown customer'
    const timing = paymentTiming(order)
    const gp = totals.complete ? totals.gp : 0
    lines.push({
      ref: order.soNumber ? `${order.id} · ${order.soNumber}` : order.id,
      customer,
      sell: totals.sell,
      cost: totals.cost,
      gp,
      costMissing: !totals.complete,
      timing,
      earlyPay: r2(gp * earlyRate(timing)),
    })
  }
  return lines
}

function localDate(iso: string): string {
  const date = new Date(iso)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function buildMonth(lines: CommissionLine[], person: Salesperson, adjustments: CommissionAdjustment[], month: string): PersonMonth {
  const mine = adjustments.filter((row) => row.salespersonId === person.id && row.month === month)
  const revenue = r2(lines.reduce((sum, row) => sum + row.sell, 0))
  const cost = r2(lines.reduce((sum, row) => sum + row.cost, 0))
  const gp = r2(lines.reduce((sum, row) => sum + row.gp, 0))
  const attainment = person.monthTarget > 0 ? revenue / person.monthTarget : 0
  const rate = ladderRate(attainment)
  const held = !!person.exception
  const impliedBase = revenue > 0 ? r2(gp * rate) : 0
  const baseCommission = held ? 0 : impliedBase
  const earlyPayBonus = held ? 0 : r2(lines.reduce((sum, row) => sum + row.earlyPay, 0))
  const clawbacks = r2(mine.reduce((sum, row) => sum + row.amount, 0))
  return {
    revenue,
    cost,
    gp,
    attainment,
    rate,
    baseCommission,
    earlyPayBonus,
    clawbacks,
    net: r2(baseCommission + earlyPayBonus + clawbacks),
    lines,
    adjustments: mine,
    costMissingCount: lines.filter((row) => row.costMissing).length,
    impliedBase,
  }
}

export function personMonth(
  orders: Order[],
  clients: Client[],
  person: Salesperson,
  adjustments: CommissionAdjustment[],
  month: string,
): PersonMonth {
  const onSheet = month === SHEET_MONTH && SHEET.some((row) => row.code === person.code)
  const lines = onSheet
    ? sheetLines(person.code)
    : [...baselineLines(person.code, person.monthTarget, month), ...ordersToLines(orders, clients, person, month)]
  return buildMonth(lines, person, adjustments, month)
}

export function sumMonths(rows: PersonMonth[]): Pick<PersonMonth, 'revenue' | 'cost' | 'gp' | 'baseCommission' | 'earlyPayBonus' | 'clawbacks' | 'net'> {
  const add = (pick: (row: PersonMonth) => number) => r2(rows.reduce((sum, row) => sum + pick(row), 0))
  return {
    revenue: add((row) => row.revenue),
    cost: add((row) => row.cost),
    gp: add((row) => row.gp),
    baseCommission: add((row) => row.baseCommission),
    earlyPayBonus: add((row) => row.earlyPayBonus),
    clawbacks: add((row) => row.clawbacks),
    net: add((row) => row.net),
  }
}

// Confirmed / Preparing orders: prices are locked on the SO but nothing is invoiced yet. Counts once Delivered.
export function personPipeline(orders: Order[], person: Salesperson): { sell: number; gp: number; count: number } {
  let sell = 0
  let gp = 0
  let count = 0
  for (const order of orders) {
    if (order.salesperson !== person.name) continue
    if (order.stage !== 'confirmed' && order.stage !== 'preparing') continue
    const totals = lockedTotals(order)
    if (!totals) continue
    sell += totals.sell
    gp += totals.complete ? totals.gp : 0
    count += 1
  }
  return { sell: r2(sell), gp: r2(gp), count }
}

export { monthKeyNow, monthProgress }

// Month-end projection at today's run-rate. Only meaningful for the current month.
export function projectAttainment(attainment: number, month: string, now = new Date()): number | null {
  if (month !== monthKeyNow(now)) return null
  const { elapsed } = monthProgress(now)
  return elapsed > 0 ? attainment / elapsed : null
}

// Next rung up the ladder and the revenue still needed to reach it. Null once at the 6% ceiling.
export function nextRung(revenue: number, target: number): { rate: number; min: number; gap: number } | null {
  if (target <= 0) return null
  const attainment = revenue / target
  const up = LADDER.filter((band) => band.min > attainment + EPS).at(-1)
  if (!up) return null
  return { rate: up.rate, min: up.min, gap: r2(up.min * target - revenue) }
}

export interface TeamRow {
  person: Salesperson
  month: PersonMonth
  pipeline: { sell: number; gp: number; count: number }
  projected: number | null
}

export interface OwnerMonth {
  revenue: number
  target: number
  attainment: number
  projected: number | null
  gp: number
  gpPct: number
  commission: number
  pipeline: number
  pipelineGp: number
  pipelineCount: number
  orderCount: number
  incompleteCount: number
  team: TeamRow[]
}

// Team figures for the owner view: WH1–WH5, same revenue and GP basis as the Commission page.
export function ownerMonth(orders: Order[], clients: Client[], people: Salesperson[], adjustments: CommissionAdjustment[], month: string): OwnerMonth {
  const team: TeamRow[] = people.map((person) => {
    const row = personMonth(orders, clients, person, adjustments, month)
    return { person, month: row, pipeline: personPipeline(orders, person), projected: projectAttainment(row.attainment, month) }
  })
  const add = (pick: (row: TeamRow) => number) => r2(team.reduce((sum, row) => sum + pick(row), 0))
  const revenue = add((row) => row.month.revenue)
  const gp = add((row) => row.month.gp)
  const target = add((row) => row.person.monthTarget)
  const attainment = target > 0 ? revenue / target : 0
  return {
    revenue,
    target,
    attainment,
    projected: projectAttainment(attainment, month),
    gp,
    gpPct: revenue > 0 ? gp / revenue : 0,
    commission: add((row) => row.month.net),
    pipeline: add((row) => row.pipeline.sell),
    pipelineGp: add((row) => row.pipeline.gp),
    pipelineCount: team.reduce((sum, row) => sum + row.pipeline.count, 0),
    orderCount: team.reduce((sum, row) => sum + row.month.lines.filter((line) => line.ref !== 'EMAS').length, 0),
    incompleteCount: team.reduce((sum, row) => sum + row.month.costMissingCount, 0),
    team,
  }
}

/* ---------- month vs year ---------- */

export interface MonthPoint {
  month: string
  revenue: number
  gp: number
  target: number
  attainment: number
  net: number
  // false for months after the current one (nothing to show yet)
  open: boolean
  // the running month, still filling up
  partial: boolean
}

export function yearMonths(year: number): string[] {
  return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`)
}

// One person's twelve months. Targets are the monthly target; future months are left empty.
export function personYear(orders: Order[], clients: Client[], person: Salesperson, adjustments: CommissionAdjustment[], year: number, now = new Date()): MonthPoint[] {
  const current = monthKeyNow(now)
  return yearMonths(year).map((month) => {
    if (month > current) {
      return { month, revenue: 0, gp: 0, target: person.monthTarget, attainment: 0, net: 0, open: false, partial: false }
    }
    const row = personMonth(orders, clients, person, adjustments, month)
    return { month, revenue: row.revenue, gp: row.gp, target: person.monthTarget, attainment: row.attainment, net: row.net, open: true, partial: month === current }
  })
}

export interface YearSummary {
  year: number
  revenue: number
  gp: number
  net: number
  // full-year target: 12 × the monthly target
  target: number
  // target for the months gone so far (the running month pro-rated by days)
  targetToDate: number
  attainment: number
  attainmentToDate: number
  projected: number | null
  months: MonthPoint[]
}

export function summariseYear(months: MonthPoint[], year: number, now = new Date()): YearSummary {
  const current = monthKeyNow(now)
  const { elapsed } = monthProgress(now)
  const add = (pick: (row: MonthPoint) => number) => r2(months.reduce((sum, row) => sum + pick(row), 0))
  const revenue = add((row) => row.revenue)
  const target = add((row) => row.target)
  const targetToDate = r2(
    months.reduce((sum, row) => {
      if (row.month < current) return sum + row.target
      if (row.month === current) return sum + row.target * elapsed
      return sum
    }, 0),
  )
  const live = year === now.getFullYear()
  const attainmentToDate = targetToDate > 0 ? revenue / targetToDate : 0
  return {
    year,
    revenue,
    gp: add((row) => row.gp),
    net: add((row) => row.net),
    target,
    targetToDate: live ? targetToDate : target,
    attainment: target > 0 ? revenue / target : 0,
    attainmentToDate: live ? attainmentToDate : target > 0 ? revenue / target : 0,
    projected: live ? attainmentToDate : null,
    months,
  }
}

// Whole team, month by month.
export function teamYear(orders: Order[], clients: Client[], people: Salesperson[], adjustments: CommissionAdjustment[], year: number, now = new Date()): YearSummary {
  const per = people.map((person) => personYear(orders, clients, person, adjustments, year, now))
  const months = yearMonths(year).map((month, index) => {
    const rows = per.map((list) => list[index])
    const revenue = r2(rows.reduce((sum, row) => sum + row.revenue, 0))
    const target = r2(rows.reduce((sum, row) => sum + row.target, 0))
    return {
      month,
      revenue,
      gp: r2(rows.reduce((sum, row) => sum + row.gp, 0)),
      target,
      attainment: target > 0 ? revenue / target : 0,
      net: r2(rows.reduce((sum, row) => sum + row.net, 0)),
      open: rows[0]?.open ?? false,
      partial: rows[0]?.partial ?? false,
    }
  })
  return summariseYear(months, year, now)
}
