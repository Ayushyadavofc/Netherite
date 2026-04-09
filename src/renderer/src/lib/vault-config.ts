import { useAuthStore } from '@/stores/authStore'

export type PresetThemeId = 'netherite' | 'hotpink' | 'solarized' | 'catppuccin'
export type ThemePresetId = PresetThemeId | 'custom'

export type ThemePaletteValues = {
  primary: string
  background: string
  surface: string
  surfaceStrong: string
  border: string
  foreground: string
  muted: string
  subtle: string
  secondary: string
  danger: string
}

export type ThemeColorKey = keyof ThemePaletteValues
export type CustomThemePalette = ThemePaletteValues

export type VaultConfig = {
  version: 1
  theme: {
    preset: ThemePresetId
    customAccent: string | null
    customPalette: CustomThemePalette
  }
  preferences: {
    showVaultStats: boolean
    enableScrapsAnimations: boolean
  }
}

export type ThemePalette = ThemePaletteValues & {
  id: PresetThemeId
  name: string
  description: string
}

export const themeColorFields: Array<{
  key: ThemeColorKey
  label: string
  description: string
}> = [
  { key: 'background', label: 'Background', description: 'Main app backdrop.' },
  { key: 'surface', label: 'Surface', description: 'Cards and panels.' },
  { key: 'surfaceStrong', label: 'Surface Strong', description: 'Raised containers and dialogs.' },
  { key: 'border', label: 'Border', description: 'Dividers and strokes.' },
  { key: 'foreground', label: 'Foreground', description: 'Primary text color.' },
  { key: 'muted', label: 'Muted', description: 'Secondary text color.' },
  { key: 'subtle', label: 'Subtle', description: 'Low-emphasis labels and timestamps.' },
  { key: 'primary', label: 'Primary', description: 'Base accent color.' },
  { key: 'secondary', label: 'Secondary', description: 'Support accent color.' },
  { key: 'danger', label: 'Danger', description: 'Errors and destructive actions.' }
]

const VAULT_THEME_STORAGE_KEY = 'netherite-active-theme'
const NEUTRAL_THEME_BASE = {
  background: '#0a0808',
  surface: '#111111',
  surfaceStrong: '#141212',
  border: '#2a2422',
  foreground: '#ffffff',
  muted: '#a8a0a0',
  subtle: '#444444'
} as const

export const themePalettes: ThemePalette[] = [
  {
    id: 'netherite',
    name: 'Nether Ember',
    description: 'The original ember-and-obsidian palette.',
    primary: '#ff5625',
    background: NEUTRAL_THEME_BASE.background,
    surface: NEUTRAL_THEME_BASE.surface,
    surfaceStrong: NEUTRAL_THEME_BASE.surfaceStrong,
    border: NEUTRAL_THEME_BASE.border,
    foreground: NEUTRAL_THEME_BASE.foreground,
    muted: NEUTRAL_THEME_BASE.muted,
    subtle: NEUTRAL_THEME_BASE.subtle,
    secondary: '#ffb77d',
    danger: '#ff5449'
  },
  {
    id: 'hotpink',
    name: 'Hotpink Noir',
    description: 'Black glass with hotpink signal accents.',
    primary: '#ff4fa3',
    background: NEUTRAL_THEME_BASE.background,
    surface: NEUTRAL_THEME_BASE.surface,
    surfaceStrong: NEUTRAL_THEME_BASE.surfaceStrong,
    border: NEUTRAL_THEME_BASE.border,
    foreground: NEUTRAL_THEME_BASE.foreground,
    muted: NEUTRAL_THEME_BASE.muted,
    subtle: NEUTRAL_THEME_BASE.subtle,
    secondary: '#ff9fd0',
    danger: '#ff6b9b'
  },
  {
    id: 'solarized',
    name: 'Solarized Ember',
    description: 'Near-black surfaces with solarized ember highlights.',
    primary: '#cb4b16',
    background: NEUTRAL_THEME_BASE.background,
    surface: NEUTRAL_THEME_BASE.surface,
    surfaceStrong: NEUTRAL_THEME_BASE.surfaceStrong,
    border: NEUTRAL_THEME_BASE.border,
    foreground: NEUTRAL_THEME_BASE.foreground,
    muted: NEUTRAL_THEME_BASE.muted,
    subtle: NEUTRAL_THEME_BASE.subtle,
    secondary: '#2aa198',
    danger: '#dc322f'
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin Obsidian',
    description: 'Obsidian surfaces with pastel signal colors.',
    primary: '#cba6f7',
    background: NEUTRAL_THEME_BASE.background,
    surface: NEUTRAL_THEME_BASE.surface,
    surfaceStrong: NEUTRAL_THEME_BASE.surfaceStrong,
    border: NEUTRAL_THEME_BASE.border,
    foreground: NEUTRAL_THEME_BASE.foreground,
    muted: NEUTRAL_THEME_BASE.muted,
    subtle: NEUTRAL_THEME_BASE.subtle,
    secondary: '#f9e2af',
    danger: '#f38ba8'
  }
]

const DEFAULT_CUSTOM_THEME = {
  primary: themePalettes[0].primary,
  background: themePalettes[0].background,
  surface: themePalettes[0].surface,
  surfaceStrong: themePalettes[0].surfaceStrong,
  border: themePalettes[0].border,
  foreground: themePalettes[0].foreground,
  muted: themePalettes[0].muted,
  subtle: themePalettes[0].subtle,
  secondary: themePalettes[0].secondary,
  danger: themePalettes[0].danger
} satisfies CustomThemePalette

export const defaultVaultConfig: VaultConfig = {
  version: 1,
  theme: {
    preset: 'netherite',
    customAccent: null,
    customPalette: { ...DEFAULT_CUSTOM_THEME }
  },
  preferences: {
    showVaultStats: true,
    enableScrapsAnimations: true
  }
}

const getThemePalette = (presetId: PresetThemeId) => {
  return themePalettes.find((palette) => palette.id === presetId) ?? themePalettes[0]
}

const normalizeColor = (value: unknown, fallback: string) => {
  if (typeof value !== 'string') {
    return fallback
  }

  const trimmed = value.trim()
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : fallback
}

const normalizeAccent = (value: unknown) => {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : null
}

const clonePaletteValues = (palette: ThemePaletteValues): CustomThemePalette => ({
  primary: palette.primary,
  background: palette.background,
  surface: palette.surface,
  surfaceStrong: palette.surfaceStrong,
  border: palette.border,
  foreground: palette.foreground,
  muted: palette.muted,
  subtle: palette.subtle,
  secondary: palette.secondary,
  danger: palette.danger
})

const normalizeCustomPalette = (value: unknown) => {
  const palette = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}

  return {
    primary: normalizeColor(palette.primary, DEFAULT_CUSTOM_THEME.primary),
    background: normalizeColor(palette.background, DEFAULT_CUSTOM_THEME.background),
    surface: normalizeColor(palette.surface, DEFAULT_CUSTOM_THEME.surface),
    surfaceStrong: normalizeColor(palette.surfaceStrong, DEFAULT_CUSTOM_THEME.surfaceStrong),
    border: normalizeColor(palette.border, DEFAULT_CUSTOM_THEME.border),
    foreground: normalizeColor(palette.foreground, DEFAULT_CUSTOM_THEME.foreground),
    muted: normalizeColor(palette.muted, DEFAULT_CUSTOM_THEME.muted),
    subtle: normalizeColor(palette.subtle, DEFAULT_CUSTOM_THEME.subtle),
    secondary: normalizeColor(palette.secondary, DEFAULT_CUSTOM_THEME.secondary),
    danger: normalizeColor(palette.danger, DEFAULT_CUSTOM_THEME.danger)
  } satisfies CustomThemePalette
}

export const normalizeVaultConfig = (config: Partial<VaultConfig> | null | undefined): VaultConfig => {
  const nextPreset = config?.theme?.preset
  const preset: ThemePresetId =
    nextPreset === 'custom' || themePalettes.some((palette) => palette.id === nextPreset)
      ? (nextPreset as ThemePresetId)
      : defaultVaultConfig.theme.preset

  return {
    version: 1,
    theme: {
      preset,
      customAccent: normalizeAccent(config?.theme?.customAccent),
      customPalette: normalizeCustomPalette(config?.theme?.customPalette)
    },
    preferences: {
      showVaultStats:
        typeof config?.preferences?.showVaultStats === 'boolean'
          ? config.preferences.showVaultStats
          : defaultVaultConfig.preferences.showVaultStats,
      enableScrapsAnimations:
        typeof config?.preferences?.enableScrapsAnimations === 'boolean'
          ? config.preferences.enableScrapsAnimations
          : defaultVaultConfig.preferences.enableScrapsAnimations
    }
  }
}

const hexToRgb = (hex: string) => {
  const normalized = hex.replace('#', '')
  const value = Number.parseInt(normalized, 16)

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  }
}

const toRgba = (hex: string, alpha: number) => {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const getReadableTextColor = (hex: string) => {
  const { r, g, b } = hexToRgb(hex)
  const normalized = [r, g, b].map((value) => {
    const channel = value / 255
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
  })
  const luminance = normalized[0] * 0.2126 + normalized[1] * 0.7152 + normalized[2] * 0.0722
  return luminance > 0.44 ? '#0b0909' : '#ffffff'
}

export const getCurrentVaultPath = () => {
  return window.localStorage.getItem('netherite-current-vault-path')
}

export const getCachedVaultConfig = () => {
  try {
    const raw = window.localStorage.getItem(VAULT_THEME_STORAGE_KEY)
    return raw ? normalizeVaultConfig(JSON.parse(raw) as VaultConfig) : defaultVaultConfig
  } catch {
    return defaultVaultConfig
  }
}

export const cacheVaultConfig = (config: VaultConfig) => {
  const normalized = normalizeVaultConfig(config)
  window.localStorage.setItem(VAULT_THEME_STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}

export const createCustomPaletteFromPreset = (presetId: PresetThemeId | 'custom') => {
  if (presetId === 'custom') {
    return clonePaletteValues(DEFAULT_CUSTOM_THEME)
  }

  return clonePaletteValues(getThemePalette(presetId))
}

export const getThemePreviewPalette = (config: VaultConfig) => {
  const normalized = normalizeVaultConfig(config)

  if (normalized.theme.preset === 'custom') {
    return {
      name: 'Custom Theme',
      description: 'Your own vault-specific palette.',
      ...clonePaletteValues(normalized.theme.customPalette)
    }
  }

  const palette = getThemePalette(normalized.theme.preset)
  return {
    name: palette.name,
    description: palette.description,
    ...clonePaletteValues(palette)
  }
}

export const applyVaultTheme = (config: VaultConfig) => {
  const normalized = normalizeVaultConfig(config)
  const palette = getThemePreviewPalette(normalized)
  const accent = normalized.theme.customAccent ?? palette.primary
  const accentForeground = getReadableTextColor(accent)
  const secondaryForeground = getReadableTextColor(palette.secondary)
  const root = document.documentElement

  root.style.setProperty('--nv-bg', palette.background)
  root.style.setProperty('--nv-surface', palette.surface)
  root.style.setProperty('--nv-surface-strong', palette.surfaceStrong)
  root.style.setProperty('--nv-border', palette.border)
  root.style.setProperty('--nv-foreground', palette.foreground)
  root.style.setProperty('--nv-muted', palette.muted)
  root.style.setProperty('--nv-subtle', palette.subtle)
  root.style.setProperty('--nv-primary', accent)
  root.style.setProperty('--nv-primary-soft', toRgba(accent, 0.14))
  root.style.setProperty('--nv-primary-soft-strong', toRgba(accent, 0.22))
  root.style.setProperty('--nv-primary-glow', toRgba(accent, 0.35))
  root.style.setProperty('--nv-primary-contrast', accentForeground)
  root.style.setProperty('--nv-secondary', palette.secondary)
  root.style.setProperty('--nv-secondary-soft', toRgba(palette.secondary, 0.14))
  root.style.setProperty('--nv-secondary-contrast', secondaryForeground)
  root.style.setProperty('--nv-danger', palette.danger)
  root.style.setProperty('--nv-danger-soft', toRgba(palette.danger, 0.16))

  root.style.setProperty('--background', palette.background)
  root.style.setProperty('--foreground', palette.foreground)
  root.style.setProperty('--card', palette.surfaceStrong)
  root.style.setProperty('--card-foreground', palette.foreground)
  root.style.setProperty('--popover', palette.surfaceStrong)
  root.style.setProperty('--popover-foreground', palette.foreground)
  root.style.setProperty('--primary', accent)
  root.style.setProperty('--primary-foreground', accentForeground)
  root.style.setProperty('--secondary', palette.surface)
  root.style.setProperty('--secondary-foreground', palette.foreground)
  root.style.setProperty('--muted', palette.background)
  root.style.setProperty('--muted-foreground', palette.muted)
  root.style.setProperty('--accent', accent)
  root.style.setProperty('--accent-foreground', accentForeground)
  root.style.setProperty('--destructive', palette.danger)
  root.style.setProperty('--destructive-foreground', '#ffffff')
  root.style.setProperty('--border', palette.border)
  root.style.setProperty('--input', palette.border)
  root.style.setProperty('--ring', accent)
  root.style.setProperty('--chart-1', accent)
  root.style.setProperty('--chart-2', palette.secondary)
  root.style.setProperty('--chart-3', toRgba(accent, 0.8))
  root.style.setProperty('--chart-4', toRgba(palette.secondary, 0.8))
  root.style.setProperty('--chart-5', palette.subtle)
  root.style.setProperty('--sidebar', palette.background)
  root.style.setProperty('--sidebar-foreground', palette.muted)
  root.style.setProperty('--sidebar-primary', accent)
  root.style.setProperty('--sidebar-primary-foreground', accentForeground)
  root.style.setProperty('--sidebar-accent', palette.surfaceStrong)
  root.style.setProperty('--sidebar-accent-foreground', palette.foreground)
  root.style.setProperty('--sidebar-border', palette.border)
  root.style.setProperty('--sidebar-ring', toRgba(accent, 0.4))

  cacheVaultConfig(normalized)
  return normalized
}

export const loadVaultConfig = async (vaultPath: string) => {
  void vaultPath
  const userId = useAuthStore.getState().user?.$id ?? 'guest'
  const config = await window.electronAPI.readAccountFile<VaultConfig>(userId, 'themes')
  const normalized = normalizeVaultConfig(config)

  if (config === null) {
    await window.electronAPI.writeAccountFile(userId, 'themes', normalized)
  }

  return normalized
}

export const saveVaultConfig = async (vaultPath: string, config: VaultConfig) => {
  void vaultPath
  const userId = useAuthStore.getState().user?.$id ?? 'guest'
  const normalized = normalizeVaultConfig(config)
  const saved = await window.electronAPI.writeAccountFile(userId, 'themes', normalized)
  return normalizeVaultConfig(saved)
}
