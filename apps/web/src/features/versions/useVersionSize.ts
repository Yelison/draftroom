import { useIntl } from 'react-intl'

/** The unit a size is told in: the largest one that keeps the number from starting with a long run of digits. */
const units = [
  { unit: 'megabyte', from: 1_000_000 },
  { unit: 'kilobyte', from: 1_000 },
  { unit: 'byte', from: 0 },
] as const

/** How big a version is, in the person's language and with the unit that suits it: `3 kB`, `1.2 MB`. */
export function useVersionSize() {
  const intl = useIntl()
  return (sizeBytes: number) => {
    const { unit, from } = units.find((candidate) => sizeBytes >= candidate.from) ?? units[2]
    return intl.formatNumber(from === 0 ? sizeBytes : sizeBytes / from, {
      style: 'unit',
      unit,
      unitDisplay: 'short',
      maximumFractionDigits: unit === 'megabyte' ? 1 : 0,
    })
  }
}
