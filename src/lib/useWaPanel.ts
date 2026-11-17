import { useState } from 'react'

const KEY = 'wh-wallcorp-wa-panel'

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === 'shown'
  } catch {
    return false
  }
}

export function useWaPanel(): [boolean, () => void] {
  const [shown, setShown] = useState(read)
  const toggle = () => {
    const next = !shown
    setShown(next)
    try {
      localStorage.setItem(KEY, next ? 'shown' : 'hidden')
    } catch {
      // storage unavailable; the choice just won't persist
    }
  }
  return [shown, toggle]
}
