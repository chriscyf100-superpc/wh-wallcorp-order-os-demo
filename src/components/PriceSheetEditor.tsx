import { Download, History, Printer, RotateCcw } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { todayISO } from '../lib/pricedesk.ts'
import {
  COLUMNS,
  DEFAULT_ADDONS,
  TOWNS,
  collections,
  sheetAsExcelHtml,
  tabName,
  townPrices,
  typedCount,
  type AddOns,
  type CellKey,
  type CollectionKey,
  type PriceSheet,
  type SheetVersion,
} from '../lib/tileSheet.ts'
import { useDesk } from '../lib/useDesk.ts'
import { cn } from '../lib/utils.ts'
import { Button } from './ui/button.tsx'
import { Input } from './ui/input.tsx'

interface Draft {
  effectiveFrom: string
  factoryCost: string
  transport: string[]
  addOns: Record<keyof AddOns, string>
  // Cells typed by hand, by town code; anything not here follows the formula.
  overrides: Record<string, Partial<Record<CellKey, string>>>
  coll: Partial<Record<CollectionKey, string>>
  note: string
}

type Shown = Pick<SheetVersion, 'factoryCost' | 'transport' | 'addOns' | 'overrides' | 'collectionOverrides'>

const ADDON_LABEL: { key: keyof AddOns; label: string }[] = [
  { key: 'bulk', label: 'Price list > 3,180 pcs: costing +' },
  { key: 'mid', label: 'Price list 1,590–3,180: costing +' },
  { key: 'smallCost', label: 'Costing 318–1,590: costing +' },
  { key: 'smallPrice', label: 'Price list 318–1,590: costing +' },
  { key: 'factory', label: 'Own collection @ factory: cost +' },
  { key: 'site', label: 'Site delivery (remark 1): +' },
  { key: 'loose', label: 'Loose, not on pallet (remark 2): +' },
]

const f2 = (value: number) => value.toFixed(2)
const num = (value: string) => Number(value.replace(/[^\d.-]/g, ''))

function toDraft(version: SheetVersion): Draft {
  return {
    effectiveFrom: todayISO(),
    factoryCost: String(version.factoryCost),
    transport: version.transport.map(String),
    addOns: Object.fromEntries(Object.entries(version.addOns).map(([k, v]) => [k, String(v)])) as Draft['addOns'],
    overrides: Object.fromEntries(
      Object.entries(version.overrides ?? {}).map(([town, row]) => [town, Object.fromEntries(Object.entries(row).map(([k, v]) => [k, String(v)]))]),
    ),
    coll: Object.fromEntries(Object.entries(version.collectionOverrides ?? {}).map(([k, v]) => [k, String(v)])),
    note: '',
  }
}

const finite = (value: string | undefined) => value !== undefined && value.trim() !== '' && Number.isFinite(num(value))

function fromDraft(draft: Draft): Shown {
  const addOns = Object.fromEntries(Object.entries(draft.addOns).map(([k, v]) => [k, Number.isFinite(num(v)) ? num(v) : 0])) as unknown as AddOns
  const overrides: NonNullable<SheetVersion['overrides']> = {}
  for (const [town, row] of Object.entries(draft.overrides)) {
    const cells = Object.fromEntries(Object.entries(row).filter(([, v]) => finite(v)).map(([k, v]) => [k, num(v as string)]))
    if (Object.keys(cells).length > 0) overrides[town] = cells
  }
  const coll = Object.fromEntries(Object.entries(draft.coll).filter(([, v]) => finite(v)).map(([k, v]) => [k, num(v as string)]))
  return {
    factoryCost: Number.isFinite(num(draft.factoryCost)) ? num(draft.factoryCost) : 0,
    transport: draft.transport.map((value) => (Number.isFinite(num(value)) ? num(value) : 0)),
    addOns: { ...DEFAULT_ADDONS, ...addOns },
    overrides,
    collectionOverrides: coll,
  }
}

// The formula value of one cell with its own typed value taken out — used to drop a "typed" mark when the
// number typed is just what the formula gives anyway.
function formulaValue(draft: Draft, town: string, key: CellKey): number {
  const rest = { ...draft.overrides[town] }
  delete rest[key]
  const shown = fromDraft({ ...draft, overrides: { ...draft.overrides, [town]: rest } })
  return townPrices(shown).find((row) => String(row.town.code) === town)?.[key] ?? 0
}

function formulaCollection(draft: Draft, key: CollectionKey): number {
  const rest = { ...draft.coll }
  delete rest[key]
  const c = collections(fromDraft({ ...draft, coll: rest }))
  return { yardCost: c.yard.cost, yardPrice: c.yard.price, factoryCost: c.factory.cost, factoryPrice: c.factory.price }[key]
}

export function PriceSheetEditor({ sheetId }: { sheetId?: string }) {
  const { priceSheets, publishSheet } = useDesk()
  const sheet = (priceSheets.find((row) => row.id === sheetId) ?? priceSheets[0]) as PriceSheet | undefined
  const latest = sheet?.versions[0]
  const [viewId, setViewId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [confirming, setConfirming] = useState(false)

  if (!sheet || !latest) return <p className="text-sm text-ink-soft">No price sheet set up.</p>
  const viewing = sheet.versions.find((v) => v.id === viewId) ?? latest
  const previous = sheet.versions[sheet.versions.indexOf(viewing) + 1]
  const editing = draft !== null
  const shown = editing ? fromDraft(draft) : viewing
  const compareTo = editing ? latest : previous
  const now = townPrices(shown)
  const was = compareTo ? townPrices(compareTo) : null
  const changes = was ? now.reduce((n, row, i) => n + COLUMNS.filter((col) => col.sell && Math.abs(row[col.key] - (was[i]?.[col.key] ?? 0)) > 0.0001).length, 0) : 0
  const avgSellDelta = was ? now.reduce((sum, row, i) => sum + (row.bulk - (was[i]?.bulk ?? 0)), 0) / now.length : 0
  const pctDelta = was ? avgSellDelta / (was.reduce((sum, row) => sum + row.bulk, 0) / was.length) : 0
  const tooEarly = editing && sheet.versions.some((v) => v.effectiveFrom > draft.effectiveFrom)
  const typed = typedCount(shown)

  const setCell = (town: string, key: CellKey, value: string) =>
    setDraft((current) => (current ? { ...current, overrides: { ...current.overrides, [town]: { ...current.overrides[town], [key]: value } } } : current))
  const clearCell = (town: string, key: CellKey) =>
    setDraft((current) => {
      if (!current) return current
      const row = { ...current.overrides[town] }
      delete row[key]
      return { ...current, overrides: { ...current.overrides, [town]: row } }
    })
  const settleCell = (town: string, key: CellKey) => {
    if (!draft) return
    const value = draft.overrides[town]?.[key]
    if (value === undefined) return
    if (!finite(value) || Math.abs(num(value) - formulaValue(draft, town, key)) < 0.00001) clearCell(town, key)
  }
  const setColl = (key: CollectionKey, value: string | undefined) =>
    setDraft((current) => {
      if (!current) return current
      const coll = { ...current.coll }
      if (value === undefined) delete coll[key]
      else coll[key] = value
      return { ...current, coll }
    })

  const set = (patch: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...patch } : current))
  const bumpCost = (by: number, percent = false) =>
    setDraft((current) => {
      const base = current ? num(current.factoryCost) : latest.factoryCost
      const next = percent ? base * (1 + by) : base + by
      return { ...(current ?? toDraft(latest)), factoryCost: String(Math.round(next * 10000) / 10000) }
    })
  const bumpTransport = (by: number) =>
    setDraft((current) => {
      const d = current ?? toDraft(latest)
      return { ...d, transport: d.transport.map((value) => String(Math.round((num(value) + by) * 100) / 100)) }
    })

  function download(version: Shown & Pick<SheetVersion, 'effectiveFrom'> & Partial<SheetVersion>) {
    const full: SheetVersion = { id: 'x', tab: tabName(version.effectiveFrom), note: '', by: 'HQ', createdAt: '', ...version }
    const blob = new Blob([sheetAsExcelHtml(sheet as PriceSheet, full)], { type: 'application/vnd.ms-excel' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Roofing Tiles Monier ${full.tab}.xls`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="grid gap-4 2xl:grid-cols-[1fr_15rem]">
      <div className="min-w-0 space-y-4">
        {/* The one input that used to mean "copy a new tab" */}
        <section className="rounded-2xl border border-line bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium tracking-wide text-ink-soft uppercase">Price sheet · replaces “copy a new tab”</p>
              <h2 className="font-display text-lg">{sheet.title}</h2>
              <p className="text-sm text-ink-soft">
                {sheet.subtitle} · prices {sheet.codes.length} EMAS codes (all Elabana colours) × {TOWNS.length} towns
              </p>
            </div>
            {!editing ? (
              <Button type="button" onClick={() => setDraft(toDraft(latest))}>
                New price change
              </Button>
            ) : null}
          </div>

          {editing ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
              <div className="rounded-xl bg-palm-soft p-3">
                <label className="block text-sm font-medium text-palm">
                  1 · Monier’s new cost per piece (RM)
                  <Input
                    className="mt-1 h-12 text-lg font-semibold tabular-nums"
                    inputMode="decimal"
                    autoFocus
                    value={draft.factoryCost}
                    onChange={(e) => set({ factoryCost: e.target.value })}
                  />
                </label>
                <p className="mt-1 text-xs text-palm">Was RM {latest.factoryCost.toFixed(4)} on the {latest.tab} sheet.</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[
                    ['+5 sen', () => bumpCost(0.05)],
                    ['+10 sen', () => bumpCost(0.1)],
                    ['+3%', () => bumpCost(0.03, true)],
                    ['+5%', () => bumpCost(0.05, true)],
                    ['−5 sen', () => bumpCost(-0.05)],
                  ].map(([label, run]) => (
                    <button key={label as string} type="button" onClick={run as () => void} className="min-h-9 rounded-full border border-palm/30 bg-card px-3 text-xs font-medium text-palm hover:bg-white">
                      {label as string}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-xl bg-sand/60 p-3">
                <label className="block text-sm font-medium">
                  2 · Effective from
                  <Input className="mt-1 h-12" type="date" value={draft.effectiveFrom} onChange={(e) => set({ effectiveFrom: e.target.value })} />
                </label>
                <p className="mt-1 text-xs text-ink-soft">Sheet name will be {tabName(draft.effectiveFrom)}, like the old tab.</p>
                <p className="mt-2 text-sm font-medium">Transport (optional)</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => bumpTransport(0.01)} className="min-h-9 rounded-full border border-line bg-card px-3 text-xs font-medium hover:bg-white">
                    +1 sen all towns
                  </button>
                  <button type="button" onClick={() => bumpTransport(-0.01)} className="min-h-9 rounded-full border border-line bg-card px-3 text-xs font-medium hover:bg-white">
                    −1 sen all towns
                  </button>
                  <span className="self-center text-xs text-ink-soft">or edit a town in the table</span>
                </div>
              </div>
              <p className="rounded-xl border border-dashed border-amber/50 bg-amber-soft/40 px-3 py-2 text-sm lg:col-span-2">
                <span className="font-medium">3 · Or type any cell.</span> Every column in the table below is open — costing, each price list, own
                collection. A typed cell is marked and stays as typed when the cost moves; tap <RotateCcw className="inline h-3 w-3" aria-label="back to formula" /> to put it back on the formula.
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-soft">
              Showing <span className="font-medium text-ink">{viewing.tab}</span> · Monier cost RM {viewing.factoryCost.toFixed(4)}/pc
              {viewing === latest ? ' · the sheet in force now' : ''}
              {previous ? ` · compared with ${previous.tab}` : ''}.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-card p-3 sm:p-4" aria-label="Prices by town">
          <div className="overflow-x-auto">
            <table className={cn('w-full text-sm', editing ? 'min-w-[60rem]' : 'min-w-[46rem]')}>
              <thead>
                <tr className="text-left text-[11px] text-ink-soft uppercase">
                  <th className="py-1 pr-2 font-medium">Town</th>
                  <th className="pr-2 text-right font-medium">KM</th>
                  {COLUMNS.map((col) => (
                    <th key={col.key} className={cn('px-2 text-right font-medium', col.sell && 'text-brick-deep')}>
                      <span className="block">{col.head}</span>
                      <span className="block font-normal normal-case">{col.sub}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {now.map((row, i) => {
                  const prior = was?.[i]
                  const stateHead = i === 0 || TOWNS[i - 1]?.state !== row.town.state
                  return (
                    <Rows key={row.town.code} head={stateHead ? row.town.state : null}>
                      <tr className="border-t border-line">
                        <td className="py-1.5 pr-2">
                          <span className="text-xs text-ink-soft tabular-nums">{row.town.code}</span> {row.town.town}
                        </td>
                        <td className="pr-2 text-right text-ink-soft tabular-nums">{row.town.km}</td>
                        {COLUMNS.map((col) => {
                          const value = row[col.key]
                          const delta = prior ? value - prior[col.key] : 0
                          const town = String(row.town.code)
                          const chip =
                            Math.abs(delta) > 0.0001 ? (
                              <span className={cn('ml-1 rounded px-1 text-[11px] font-medium', delta > 0 ? 'bg-amber-soft text-amber' : 'bg-ok-soft text-ok')}>
                                {delta > 0 ? '+' : '−'}
                                {f2(Math.abs(delta))}
                              </span>
                            ) : null
                          if (editing && col.key === 'transport') {
                            return (
                              <td key={col.key} className="px-2 text-right">
                                <input
                                  aria-label={`Transport to ${row.town.town}`}
                                  inputMode="decimal"
                                  value={draft.transport[i] ?? ''}
                                  onChange={(e) => set({ transport: draft.transport.map((v, j) => (j === i ? e.target.value : v)) })}
                                  className="h-8 w-16 rounded-md border border-line bg-card px-1.5 text-right tabular-nums focus-visible:border-brick focus-visible:outline-none"
                                />
                              </td>
                            )
                          }
                          if (editing && col.key !== 'transport') {
                            const key = col.key
                            const own = draft.overrides[town]?.[key]
                            const isTyped = own !== undefined
                            return (
                              <td key={col.key} className="px-1.5 py-0.5 text-right whitespace-nowrap">
                                <span className="inline-flex items-center gap-0.5">
                                  <input
                                    aria-label={`${col.head} ${col.sub}, ${row.town.town}`}
                                    inputMode="decimal"
                                    value={own ?? f2(value)}
                                    onFocus={(e) => e.currentTarget.select()}
                                    onChange={(e) => setCell(town, key, e.target.value)}
                                    onBlur={() => settleCell(town, key)}
                                    className={cn(
                                      'h-8 w-16 rounded-md border px-1.5 text-right tabular-nums focus-visible:border-brick focus-visible:outline-none',
                                      isTyped ? 'border-amber bg-amber-soft font-semibold text-ink' : 'border-transparent bg-sand/40 hover:border-line',
                                      col.sell && !isTyped && 'font-medium',
                                    )}
                                  />
                                  {isTyped ? (
                                    <button type="button" aria-label={`Put ${row.town.town} ${col.sub} back on the formula`} onClick={() => clearCell(town, key)} className="grid h-6 w-6 place-items-center rounded text-amber hover:bg-amber-soft">
                                      <RotateCcw className="h-3 w-3" aria-hidden="true" />
                                    </button>
                                  ) : null}
                                </span>
                                {chip}
                              </td>
                            )
                          }
                          return (
                            <td key={col.key} className={cn('px-2 text-right tabular-nums', col.sell && 'font-medium', col.key !== 'transport' && row.typed.includes(col.key) && 'text-amber')}>
                              {f2(value)}
                              {chip}
                            </td>
                          )
                        })}
                      </tr>
                    </Rows>
                  )
                })}
                {(() => {
                  const c = collections(shown)
                  const rows: { label: string; cost: CollectionKey; price: CollectionKey; values: { cost: number; price: number } }[] = [
                    { label: 'Own collection @ Shah Alam', cost: 'yardCost', price: 'yardPrice', values: c.yard },
                    { label: 'Own collection @ Monier factory (pallet)', cost: 'factoryCost', price: 'factoryPrice', values: c.factory },
                  ]
                  return rows.map((r) => (
                    <tr key={r.label} className="border-t border-line bg-sand/40">
                      <td className="py-1.5 pr-2" colSpan={4}>
                        {r.label}
                      </td>
                      {(['cost', 'price'] as const).map((which) => {
                        const key = r[which]
                        const value = r.values[which]
                        const own = draft?.coll[key]
                        if (!editing) {
                          return (
                            <td key={which} className={cn('px-2 text-right tabular-nums', which === 'price' && 'font-medium')}>
                              {f2(value)}
                            </td>
                          )
                        }
                        return (
                          <td key={which} className="px-1.5 py-0.5 text-right whitespace-nowrap">
                            <span className="inline-flex items-center gap-0.5">
                              <input
                                aria-label={`${r.label} ${which}`}
                                inputMode="decimal"
                                value={own ?? f2(value)}
                                onFocus={(e) => e.currentTarget.select()}
                                onChange={(e) => setColl(key, e.target.value)}
                                onBlur={() => {
                                  if (own !== undefined && (!finite(own) || Math.abs(num(own) - formulaCollection(draft, key)) < 0.00001)) setColl(key, undefined)
                                }}
                                className={cn(
                                  'h-8 w-16 rounded-md border px-1.5 text-right tabular-nums focus-visible:border-brick focus-visible:outline-none',
                                  own !== undefined ? 'border-amber bg-amber-soft font-semibold' : 'border-transparent bg-card hover:border-line',
                                )}
                              />
                              {own !== undefined ? (
                                <button type="button" aria-label={`Put ${r.label} ${which} back on the formula`} onClick={() => setColl(key, undefined)} className="grid h-6 w-6 place-items-center rounded text-amber hover:bg-amber-soft">
                                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                                </button>
                              ) : null}
                            </span>
                          </td>
                        )
                      })}
                      <td colSpan={3} />
                    </tr>
                  ))
                })()}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            Costing delivered = Monier cost + transport. Each price list = costing + its add-on. Remarks: site delivery +RM {f2(shown.addOns.site)}/pc, loose +RM{' '}
            {f2(shown.addOns.loose)}/pc. Blue columns are what the customer pays.
            {typed > 0 ? <span className="text-amber"> {typed} cell{typed === 1 ? ' is' : 's are'} typed by hand (amber), not from the formula.</span> : null}
          </p>
        </section>

        {editing ? (
          <section className="sticky bottom-2 z-10 rounded-2xl border border-brick/30 bg-card p-4 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">
                <span className="font-semibold">{changes} selling prices change</span> across {TOWNS.length} towns · bulk price{' '}
                <span className={cn('font-medium', avgSellDelta > 0 ? 'text-amber' : avgSellDelta < 0 ? 'text-ok' : '')}>
                  {avgSellDelta >= 0 ? '+' : '−'}RM {f2(Math.abs(avgSellDelta))}/pc ({(pctDelta * 100).toFixed(1)}%)
                </span>{' '}
                · effective {tabName(draft.effectiveFrom)}
                {typed > 0 ? (
                  <span className="block text-xs text-amber">
                    {typed === 1 ? '1 typed cell keeps its number.' : `${typed} typed cells keep their numbers.`}{' '}
                    <button type="button" className="font-medium underline" onClick={() => set({ overrides: {}, coll: {} })}>
                      Put all back on the formula
                    </button>
                  </span>
                ) : null}
                {tooEarly ? <span className="block text-xs text-amber">A newer sheet already exists after this date — this one will slot in between.</span> : null}
              </p>
              {confirming ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-ink-soft">Everyone gets a notice and the sales WhatsApp group gets the new prices. Open drafts reprice; locked SOs keep theirs.</span>
                  <Button
                    type="button"
                    onClick={() => {
                      publishSheet(sheet.id, { ...fromDraft(draft), effectiveFrom: draft.effectiveFrom, note: draft.note || 'Price change', by: 'HQ' })
                      setDraft(null)
                      setConfirming(false)
                      setViewId(null)
                    }}
                  >
                    Yes, publish {tabName(draft.effectiveFrom)}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
                    Back
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => download({ ...fromDraft(draft), effectiveFrom: draft.effectiveFrom })}>
                    <Download className="h-4 w-4" aria-hidden="true" /> Preview .xls
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                    <RotateCcw className="h-4 w-4" aria-hidden="true" /> Discard
                  </Button>
                  <Button type="button" disabled={changes === 0 && num(draft.factoryCost) === latest.factoryCost && typed === typedCount(latest)} onClick={() => setConfirming(true)}>
                    Publish
                  </Button>
                </div>
              )}
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-brick">Add-ons (rarely change)</summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {ADDON_LABEL.map((row) => (
                  <label key={row.key} className="flex items-center justify-between gap-2 text-xs text-ink-soft">
                    {row.label}
                    <input
                      inputMode="decimal"
                      value={draft.addOns[row.key]}
                      onChange={(e) => set({ addOns: { ...draft.addOns, [row.key]: e.target.value } })}
                      className="h-8 w-16 rounded-md border border-line bg-card px-1.5 text-right text-sm text-ink tabular-nums"
                    />
                  </label>
                ))}
              </div>
            </details>
          </section>
        ) : null}
      </div>

      <aside className="min-w-0 space-y-3 2xl:order-none">
        <section className="rounded-2xl border border-line bg-card p-3">
          <h3 className="flex items-center gap-2 font-display text-base">
            <History className="h-4 w-4 text-ink-soft" aria-hidden="true" /> Sheets
          </h3>
          <p className="text-xs text-ink-soft">Every version is kept — the old tabs, without the copying.</p>
          <ul className="mt-2 flex gap-1 overflow-x-auto pb-1 2xl:block 2xl:max-h-[26rem] 2xl:space-y-1 2xl:overflow-y-auto">
            {sheet.versions.map((version, index) => {
              const older = sheet.versions[index + 1]
              const move = older ? version.factoryCost - older.factoryCost : 0
              const active = !editing && viewing.id === version.id
              return (
                <li key={version.id} className="shrink-0">
                  <button
                    type="button"
                    disabled={editing}
                    onClick={() => setViewId(version.id)}
                    className={cn('w-full rounded-lg px-2 py-1.5 text-left text-sm disabled:opacity-50', active ? 'bg-ink text-paper' : 'hover:bg-sand')}
                  >
                    <span className="flex justify-between gap-2">
                      <span className="font-medium tabular-nums">{version.tab}</span>
                      {index === 0 ? <span className={cn('text-[11px]', active ? 'text-paper/80' : 'text-ok')}>in force</span> : null}
                    </span>
                    <span className={cn('block text-xs tabular-nums', active ? 'text-paper/80' : 'text-ink-soft')}>
                      cost {version.factoryCost.toFixed(4)}
                      {Math.abs(move) > 0.00001 ? ` (${move > 0 ? '+' : '−'}${Math.abs(move).toFixed(4)})` : ''}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
        {!editing ? (
          <div className="flex flex-wrap gap-2 2xl:flex-col">
            <Button type="button" variant="outline" onClick={() => download(viewing)}>
              <Download className="h-4 w-4" aria-hidden="true" /> Download {viewing.tab} (.xls)
            </Button>
            <Button type="button" variant="ghost" onClick={() => window.print()}>
              <Printer className="h-4 w-4" aria-hidden="true" /> Print
            </Button>
          </div>
        ) : null}
      </aside>
    </div>
  )
}

function Rows({ head, children }: { head: string | null; children: ReactNode }) {
  return (
    <>
      {head ? (
        <tr>
          <td colSpan={2 + COLUMNS.length} className="pt-3 pb-1 text-xs font-semibold tracking-wide text-ink-soft uppercase">
            {head}
          </td>
        </tr>
      ) : null}
      {children}
    </>
  )
}
