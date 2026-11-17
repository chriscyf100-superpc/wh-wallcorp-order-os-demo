import { earlyRate } from './commission.ts'
import type { CommissionLine, PayTiming } from './commission.ts'
import type { CommissionAdjustment, Salesperson } from './types.ts'

export const SHEET_MONTH = '2026-09'

// Frozen from Chris's Sep'26 summary sheet (photo, 09/26). Sales and cost are the sheet figures;
// GP, attainment, rate and commission are recomputed by the engine and checked against `sheetCommission`.
// WH1's target is 994,455 on the sheet (earlier notes said 994,445).
interface SheetRow {
  code: string
  name: string
  sales: number
  cost: number
  target: number
  sheetCommission: number | null
}

export const SHEET: SheetRow[] = [
  { code: 'WH1', name: 'Boon', sales: 1029077.51, cost: 977634.09, target: 994455, sheetCommission: 2572.17 },
  { code: 'WH2', name: 'Geh', sales: 448565.42, cost: 415677.21, target: 606375, sheetCommission: 822.21 },
  { code: 'WH3', name: 'Lye Seng', sales: 1027404.07, cost: 970661.61, target: 994455, sheetCommission: 2837.12 },
  { code: 'WH4', name: 'Jt', sales: 236420.98, cost: 225324.32, target: 606375, sheetCommission: 277.42 },
  { code: 'WH5', name: 'Han', sales: 888446.28, cost: 818536.73, target: 1212750, sheetCommission: 1747.74 },
]

const r2 = (value: number): number => Math.round(value * 100) / 100

// Demo-only: the sheet has no per-invoice payment data, so Boon's month is split into four illustrative
// payment buckets (sums match the sheet exactly) to show the 14-day early-pay add-on. Everyone else shows "No pay data".
const BOON_SPLIT: { share: number; timing: PayTiming; customer: string }[] = [
  { share: 0.4, timing: { days: 5 }, customer: 'Invoices paid in 5 days (demo split)' },
  { share: 0.3, timing: { days: 14 }, customer: 'Invoices paid in 14 days (demo split)' },
  { share: 0.2, timing: { days: 22 }, customer: 'Invoices paid in 22 days (demo split)' },
  { share: 0.1, timing: 'unpaid', customer: 'Invoices not yet paid (demo split)' },
]

export function sheetLines(code: string): CommissionLine[] {
  const row = SHEET.find((item) => item.code === code)
  if (!row || row.sales === 0) return []
  if (code !== 'WH1') {
    return [
      {
        ref: 'Sep ’26 sheet',
        customer: 'All Sep invoices (HQ summary sheet)',
        sell: row.sales,
        cost: row.cost,
        gp: r2(row.sales - row.cost),
        costMissing: false,
        timing: 'n/a',
        earlyPay: 0,
      },
    ]
  }
  let sellLeft = row.sales
  let costLeft = row.cost
  return BOON_SPLIT.map((part, index) => {
    const last = index === BOON_SPLIT.length - 1
    const sell = last ? r2(sellLeft) : r2(row.sales * part.share)
    const cost = last ? r2(costLeft) : r2(row.cost * part.share)
    sellLeft -= sell
    costLeft -= cost
    const gp = r2(sell - cost)
    return {
      ref: `WH1 Sep ’26 · ${part.share * 100}%`,
      customer: part.customer,
      sell,
      cost,
      gp,
      costMissing: false,
      timing: part.timing,
      earlyPay: r2(gp * earlyRate(part.timing)),
    }
  })
}

export function seedSalespeople(): Salesperson[] {
  // WH1–WH5 are the real team. Sep '26 comes from the HQ sheet; later months roll up live (see baselineLines).
  return SHEET.map((row) => ({
    id: row.code.toLowerCase(),
    code: row.code,
    name: row.name,
    monthTarget: row.target,
    basis: 'sheet',
  }))
}

// Demo stand-in for invoices already sitting in EMAS, so each person starts the month at a believable figure
// and board orders add on top. `oct` is Oct '26 attainment at close; `pace` is this month's run-rate vs target;
// `gp` is GP % of sales, taken from each person's Sep sheet (sales − cost) ÷ sales.
export const CLOSED_MONTH = '2026-10'

const PROFILE: Record<string, { oct: number; pace: number; gp: number }> = {
  WH1: { oct: 0.968, pace: 1.012, gp: 0.05 },
  WH2: { oct: 0.824, pace: 0.786, gp: 0.0733 },
  WH3: { oct: 1.081, pace: 0.948, gp: 0.0552 },
  WH4: { oct: 0.517, pace: 0.462, gp: 0.0469 },
  WH5: { oct: 0.912, pace: 0.861, gp: 0.0787 },
}

export function monthKeyNow(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// How much of the current month has gone, counting today as half a day.
export function monthProgress(now = new Date()): { day: number; days: number; elapsed: number } {
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const day = now.getDate()
  return { day, days, elapsed: (day - 0.5) / days }
}

// Demo history so the year view and the month-vs-year charts have something to draw. Monthly attainment
// (sales ÷ that person's monthly target) for Jan 2025 → Aug 2026; Sep 2026 is the HQ sheet, Oct the PROFILE above.
// Illustrative only — swap for EMAS monthly sales by salesperson when the export is wired in.
export const HISTORY_START = '2025-01'
const HISTORY_ATTAIN: Record<string, number[]> = {
  //      2025: Jan   Feb   Mar   Apr   May   Jun   Jul   Aug   Sep   Oct   Nov   Dec | 2026: Jan  Feb   Mar   Apr   May   Jun   Jul   Aug
  WH1: [0.78, 0.62, 0.88, 0.91, 0.95, 0.9, 0.97, 1.02, 0.94, 0.99, 0.92, 0.84, 0.86, 0.7, 0.96, 0.98, 1.04, 0.97, 1.03, 1.06],
  WH2: [0.66, 0.52, 0.72, 0.75, 0.79, 0.74, 0.8, 0.83, 0.77, 0.81, 0.76, 0.69, 0.7, 0.58, 0.79, 0.81, 0.84, 0.8, 0.82, 0.85],
  WH3: [0.84, 0.66, 0.93, 0.97, 1.01, 0.95, 1.03, 1.06, 0.99, 1.04, 0.98, 0.9, 0.92, 0.74, 1.01, 1.05, 1.1, 1.02, 1.08, 1.12],
  WH4: [0.48, 0.38, 0.52, 0.55, 0.58, 0.54, 0.57, 0.6, 0.55, 0.58, 0.54, 0.5, 0.47, 0.39, 0.5, 0.53, 0.55, 0.51, 0.49, 0.52],
  WH5: [0.72, 0.58, 0.8, 0.83, 0.87, 0.82, 0.88, 0.91, 0.85, 0.9, 0.84, 0.77, 0.8, 0.64, 0.86, 0.88, 0.93, 0.87, 0.9, 0.94],
}

function historyShare(code: string, month: string): number {
  const [year, mon] = month.split('-').map(Number)
  const index = (year - 2025) * 12 + (mon - 1)
  return HISTORY_ATTAIN[code]?.[index] ?? 0
}

export function baselineLines(code: string, target: number, month: string, now = new Date()): CommissionLine[] {
  const profile = PROFILE[code]
  if (!profile || target <= 0) return []
  let share = 0
  let customer = ''
  if (month === CLOSED_MONTH) {
    share = profile.oct
    customer = 'Oct invoices already in EMAS (demo import)'
  } else if (month === monthKeyNow(now) && month > CLOSED_MONTH) {
    share = profile.pace * monthProgress(now).elapsed
    customer = 'This month’s invoices already in EMAS (demo import)'
  } else if (HISTORY_ATTAIN[code] && month < SHEET_MONTH && month >= HISTORY_START) {
    share = historyShare(code, month)
    customer = 'Invoices already in EMAS (demo history)'
  } else {
    return []
  }
  const sell = r2(target * share)
  const cost = r2(sell * (1 - profile.gp))
  return [{ ref: 'EMAS', customer, sell, cost, gp: r2(sell - cost), costMissing: false, timing: 'n/a', earlyPay: 0 }]
}

// Sample credit notes. Amounts are commission clawed back, deducted in the month shown.
export function seedAdjustments(): CommissionAdjustment[] {
  return [
    { id: 'cn-1', salespersonId: 'ch1', month: '2026-09', amount: -165, reason: 'CN-0412 Sg Petani Builders: wrong grade returned, GP reversed' },
    { id: 'cn-2', salespersonId: 'ch5', month: '2026-09', amount: -92.4, reason: 'CN-0417 Kota Setar Premier: price correction on delivered load' },
    { id: 'cn-3', salespersonId: 'ch3', month: '2026-10', amount: -38.5, reason: 'CN-0421 Utara: 2 pallets short-delivered, credited' },
  ]
}
