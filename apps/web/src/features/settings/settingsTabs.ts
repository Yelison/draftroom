import type { RouteHandle } from '../../app/sections.ts'

/** The tabs of Settings, in the order they are offered. Each one is a route: `/settings/<tab>`. */
export const settingsTabs = ['profile', 'workspace', 'members', 'appearance'] as const
export type SettingsTab = (typeof settingsTabs)[number]

export const isSettingsTab = (value: string): value is SettingsTab => settingsTabs.some((tab) => tab === value)

/** What every tab route declares: the rail keeps Settings current, and moving between tabs leaves the focus on the tab. */
export const settingsTabHandle = { section: 'settings', tab: true } satisfies RouteHandle
