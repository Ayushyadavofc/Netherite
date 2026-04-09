import * as React from 'react'

const DESKTOP_BREAKPOINT = 1024

export function useIsDesktopSidebar() {
  const [isDesktop, setIsDesktop] = React.useState(() =>
    typeof window === 'undefined' ? true : window.innerWidth >= DESKTOP_BREAKPOINT
  )

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`)
    const update = () => setIsDesktop(mediaQuery.matches)

    update()
    mediaQuery.addEventListener('change', update)

    return () => mediaQuery.removeEventListener('change', update)
  }, [])

  return isDesktop
}
