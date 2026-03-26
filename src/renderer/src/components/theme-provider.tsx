'use client'

import * as React from 'react'

export interface ThemeProviderProps {
  children: React.ReactNode
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  void props
  return <>{children}</>
}
