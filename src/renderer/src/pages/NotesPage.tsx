import { useEffect } from 'react'

import { Workspace } from '@/components/notes/workspace'

export default function NotesPage() {
  useEffect(() => {
    const mounted = `[RENDERER][${new Date().toISOString()}] NotesPage MOUNTED`
    console.log(mounted)
    void window.electronAPI.appLog(mounted)

    return () => {
      const unmounted = `[RENDERER][${new Date().toISOString()}] NotesPage UNMOUNTED`
      console.log(unmounted)
      void window.electronAPI.appLog(unmounted)
    }
  }, [])

  return <Workspace />
}
