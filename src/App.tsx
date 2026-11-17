import { Component, useEffect, type ReactNode } from 'react'
import { Login } from './components/Login.tsx'
import { Shell } from './components/Shell.tsx'
import { PAGE } from './lib/labels.ts'
import { STORAGE_KEY } from './lib/storage.ts'
import { DeskProvider } from './lib/store.tsx'
import { useDesk } from './lib/useDesk.ts'
import { useView } from './lib/useView.ts'

export default function App() {
  return (
    <DeskBoundary>
      <DeskProvider>
        <DeskApp />
      </DeskProvider>
    </DeskBoundary>
  )
}

function DeskApp() {
  const { authed } = useDesk()
  const [view, go] = useView()

  useEffect(() => {
    document.title = `${PAGE[view].title} · W&H Wallcorp — Order OS (Demo)`
  }, [view])

  if (!authed) return <Login />
  return <Shell view={view} go={go} />
}

class DeskBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="mx-auto max-w-md px-6 py-16">
        <p className="text-xs font-semibold tracking-[0.16em] text-brick">DEMO</p>
        <h1 className="mt-2 font-display text-3xl tracking-tight">The desk hit a snag</h1>
        <p className="mt-3 text-sm leading-6 text-ink-soft">
          This preview keeps its data in the browser. Clearing that save usually gets the meeting going again.
        </p>
        <button
          type="button"
          className="mt-5 rounded-lg bg-brick px-4 py-2 text-sm font-medium text-white"
          onClick={() => {
            localStorage.removeItem(STORAGE_KEY)
            location.reload()
          }}
        >
          Reset and reload
        </button>
      </div>
    )
  }
}
