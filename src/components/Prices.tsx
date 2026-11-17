import { useState, type DragEvent } from 'react'
import { unitWord } from '../lib/format.ts'
import { SAMPLE_PRICE_CSV } from '../lib/samplePrices.ts'
import { useDesk } from '../lib/useDesk.ts'
import type { Sku } from '../lib/types.ts'
import { Note } from './bits.tsx'
import { Button } from './ui/button.tsx'
import { NumberField } from './ui/number-field.tsx'

export function Prices() {
  const { skus, priceFileName, loadPrices, setTier } = useDesk()
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)

  function apply(csv: string, fileName: string) {
    const result = loadPrices(csv, fileName)
    setError(result.ok ? '' : result.message)
  }

  function onFile(file: File | undefined) {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      setError('This demo reads a CSV export. In Excel: File → Save As → CSV.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      apply(text, file.name)
    }
    reader.onerror = () => setError('Could not read that file.')
    reader.readAsText(file)
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragOver(false)
    onFile(event.dataTransfer.files[0])
  }

  function downloadSample() {
    const blob = new Blob([SAMPLE_PRICE_CSV], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'wh-wallcorp-sample-prices.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <Note>
        Quick tier sheet. This is the fallback for items with no Price Desk row, and it carries no cost. Real sell and
        cost live on the Price Desk. Drop an Excel CSV with columns <span className="font-medium">sku, min_qty, price</span>. It stays in this
        browser. Orders already confirmed keep the price they were booked at. A new order, or a quantity change in the
        queue, picks up the sheet.
      </Note>

      <section
        className={
          dragOver
            ? 'rounded-2xl border border-dashed border-brick bg-sand/80 p-4'
            : 'rounded-2xl border border-dashed border-line bg-sand/40 p-4'
        }
        onDragOver={(event) => {
          event.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <h2 className="font-display text-lg">Excel price sheet</h2>
        <p className="mt-1 text-sm text-ink-soft">
          {priceFileName ? `Loaded ${priceFileName}` : 'No file loaded yet. The tiers below are the meeting sheet.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <label className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-line bg-card px-4 text-sm font-medium hover:bg-sand">
            Choose CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => {
                onFile(event.target.files?.[0])
                event.target.value = ''
              }}
            />
          </label>
          <Button
            variant="palm"
            onClick={() => {
              apply(SAMPLE_PRICE_CSV, 'sample-prices.csv')
            }}
          >
            Load sample CSV
          </Button>
          <Button variant="ghost" onClick={downloadSample}>
            Download sample
          </Button>
        </div>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-rose">
            {error}
          </p>
        ) : null}
      </section>

      <ul className="space-y-3">
        {skus.map((sku) => (
          <li
            key={sku.id}
            className={
              sku.id === 'red-brick'
                ? 'rounded-2xl border border-brick/40 bg-card p-4 ring-1 ring-brick/15'
                : 'rounded-2xl border border-line bg-card p-4'
            }
          >
            <SkuTiers sku={sku} onTier={setTier} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function SkuTiers({
  sku,
  onTier,
}: {
  sku: Sku
  onTier: (skuId: string, index: number, patch: { minQty?: number; price?: number }) => void
}) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg">
          {sku.name} <span className="text-lg font-normal text-ink-soft">{sku.nameZh}</span>
        </h2>
        <p className="text-xs text-ink-soft">{sku.code}</p>
      </div>
      {sku.id === 'red-brick' ? (
        <p className="mt-1 text-sm text-palm">Show this one: under 15 is Price A, 15–19 is Price B, 20 and up is Price C.</p>
      ) : null}
      <ul className="mt-3 space-y-2">
        {sku.tiers.map((tier, index) => (
          <li key={`${sku.id}-${index}`} className="grid grid-cols-[5.5rem_1fr_7.5rem] items-center gap-2">
            <NumberField
              aria-label={`${sku.name} ${tier.label} minimum quantity`}
              min={1}
              value={tier.minQty}
              onCommit={(minQty) => onTier(sku.id, index, { minQty })}
            />
            <span className="text-sm">
              {unitWord(sku.unit, tier.minQty)} · {tier.label}
              <span className="block text-xs text-ink-soft">{sku.unitZh}</span>
            </span>
            <NumberField
              aria-label={`${sku.name} ${tier.label} price`}
              min={0}
              value={tier.price}
              onCommit={(price) => onTier(sku.id, index, { price })}
            />
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-soft">Prices in RM. The higher quantity wins.</p>
    </div>
  )
}
