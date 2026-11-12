import { useSyncExternalStore } from 'react'
import { getSnapshot, subscribe, type AppData } from '../lib/store'

export function useAppData(): AppData {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
