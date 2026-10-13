import type { SVGProps } from 'react'

/**
 * The clock of the History item. Forma UI 0.3.0 has no clock; 0.4.0 does, and this file is removed when the app
 * migrates to it. It is drawn as the library draws its own icons (24 px grid, 1.7 px stroke that stays that thick at
 * any size, the colour of the text) so the two kinds sit together in the rail.
 */
export function ClockIcon({ size = 20, ...props }: { size?: number } & Omit<SVGProps<SVGSVGElement>, 'children'>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21Z"
        vectorEffect="non-scaling-stroke"
      />
      <path d="M12 7V12L15 14" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
