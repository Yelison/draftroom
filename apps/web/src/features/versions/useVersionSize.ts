import { useIntl } from 'react-intl'

/** The unit a size is told in: megabytes from a million bytes, kilobytes below it. */
const megabyte = 1_000_000

/**
 * How big a version is, in the person's language: `3 kB`, `1.2 MB`. It starts at kilobytes, as a file manager does: ICU
 * writes `640 byte` in English, which reads as a mistake, and a version is never as small as a byte count would say. A
 * size above zero is at least `1 kB`; only an empty one is `0 kB`.
 */
export function useVersionSize() {
  const intl = useIntl()
  return (sizeBytes: number) => {
    const inMegabytes = sizeBytes >= megabyte
    return intl.formatNumber(inMegabytes ? sizeBytes / megabyte : Math.max(sizeBytes > 0 ? 1 : 0, sizeBytes / 1000), {
      style: 'unit',
      unit: inMegabytes ? 'megabyte' : 'kilobyte',
      unitDisplay: 'short',
      maximumFractionDigits: inMegabytes ? 1 : 0,
    })
  }
}
