// Live-query hook (Stream C): re-run a Dexie query whenever its tables change.
//
// Dexie's liveQuery re-runs the query on any write to the tables it
// touches, so lists stay current without manual refresh calls. Returns
// undefined while the first result is loading, then the array.
import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'

export function useLiveList<T>(query: () => Promise<T[]>, deps: readonly unknown[] = []): T[] | undefined {
  const [value, setValue] = useState<T[] | undefined>(undefined)
  useEffect(() => {
    const subscription = liveQuery(query).subscribe({
      next: (rows) => setValue(rows),
      error: (err) => {
        console.error('Live query failed', err)
        setValue([])
      },
    })
    return () => subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return value
}
