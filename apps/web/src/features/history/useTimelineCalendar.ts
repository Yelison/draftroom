import { useIntl } from 'react-intl'
import { firstDayOfWeek, type CalendarOptions } from './timelineGroups.ts'

/** Where and when the person is: their time zone and the first day of the week of their language. */
export function useTimelineCalendar(): CalendarOptions & { locale: string } {
  const { locale, timeZone } = useIntl()
  return {
    locale,
    timeZone: timeZone ?? new Intl.DateTimeFormat().resolvedOptions().timeZone,
    firstDay: firstDayOfWeek(locale),
  }
}
