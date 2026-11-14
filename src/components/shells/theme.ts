export type ShellTheme = 'light' | 'navy' | 'vendor' | 'rider' | 'student' | 'military' | 'other'

/** One look per area. Tailwind needs whole class names, so every variant is spelled out here. */
export const SHELL_THEMES: Record<
  ShellTheme,
  {
    dark: boolean
    aside: string
    label: string
    link: string
    divider: string
    topBar: string
    chip: string | null
    chipLabel: string | null
    chipIcon: 'store' | 'bike' | 'bag' | 'shield' | 'user'
  }
> = {
  light: {
    dark: false,
    aside: 'border-r border-line bg-card',
    label: 'text-muted',
    link: 'text-ink hover:bg-brand-50',
    divider: 'border-line',
    topBar: 'border-t-gold-400',
    chip: null,
    chipLabel: null,
    chipIcon: 'user',
  },
  navy: {
    dark: true,
    aside: 'bg-navy-900 text-white',
    label: 'text-navy-text/80',
    link: 'text-navy-text hover:bg-navy-800 hover:text-white',
    divider: 'border-white/10',
    topBar: 'border-t-gold-400',
    chip: null,
    chipLabel: null,
    chipIcon: 'user',
  },
  vendor: {
    dark: true,
    aside: 'bg-vendor-900 text-white',
    label: 'text-vendor-text/80',
    link: 'text-vendor-text hover:bg-vendor-800 hover:text-white',
    divider: 'border-white/10',
    topBar: 'border-t-vendor-800',
    chip: 'bg-vendor-50 text-vendor-800',
    chipLabel: 'Shop',
    chipIcon: 'store',
  },
  rider: {
    dark: true,
    aside: 'bg-rider-900 text-white',
    label: 'text-rider-text/80',
    link: 'text-rider-text hover:bg-rider-800 hover:text-white',
    divider: 'border-white/10',
    topBar: 'border-t-rider-800',
    chip: 'bg-rider-50 text-rider-800',
    chipLabel: 'Rider',
    chipIcon: 'bike',
  },
  student: {
    dark: true,
    aside: 'bg-student-900 text-white',
    label: 'text-student-text/80',
    link: 'text-student-text hover:bg-student-800 hover:text-white',
    divider: 'border-white/10',
    topBar: 'border-t-student-700',
    chip: 'bg-student-50 text-student-800',
    chipLabel: 'Student',
    chipIcon: 'bag',
  },
  military: {
    dark: true,
    aside: 'bg-military-900 text-white',
    label: 'text-military-text/80',
    link: 'text-military-text hover:bg-military-800 hover:text-white',
    divider: 'border-white/10',
    topBar: 'border-t-military-700',
    chip: 'bg-military-50 text-military-800',
    chipLabel: 'Military',
    chipIcon: 'shield',
  },
  other: {
    dark: true,
    aside: 'bg-other-900 text-white',
    label: 'text-other-text/80',
    link: 'text-other-text hover:bg-other-800 hover:text-white',
    divider: 'border-white/10',
    topBar: 'border-t-other-700',
    chip: 'bg-other-50 text-other-800',
    chipLabel: 'Member',
    chipIcon: 'user',
  },
}
