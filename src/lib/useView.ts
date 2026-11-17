import { useEffect, useState } from 'react'
import { VIEWS } from './labels.ts'
import type { View } from './types.ts'

export function readView(): View {
  const raw = window.location.hash.replace(/^#\/?/, '')
  if (raw === 'kanban') return 'board'
  if (raw.startsWith('order/')) return 'document'
  if ((VIEWS as readonly string[]).includes(raw)) return raw as View
  return 'dashboard'
}

export function useView(): [View, (view: View) => void] {
  const [view, setView] = useState<View>(readView)
  useEffect(() => {
    const onHash = () => setView(readView())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const go = (next: View) => {
    if (window.location.hash !== `#${next}`) window.location.hash = next
    setView(next)
  }
  return [view, go]
}

export function readDocId(): string {
  return decodeURIComponent(window.location.hash.replace(/^#\/?order\//, ''))
}

export function openDocument(orderId: string): void {
  window.location.hash = `order/${encodeURIComponent(orderId)}`
}
