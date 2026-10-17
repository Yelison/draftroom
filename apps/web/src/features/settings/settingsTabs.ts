/** The tabs of Settings, in the order they are offered. Each one is a route: `/settings/<tab>`. */
export const settingsTabs = ['profile', 'workspace', 'members', 'appearance'] as const
export type SettingsTab = (typeof settingsTabs)[number]

export const isSettingsTab = (value: string): value is SettingsTab => settingsTabs.some((tab) => tab === value)
