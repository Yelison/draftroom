import type { Schema } from '@draftroom/contract'
import { Select } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import type { MessageId } from '../../i18n/messages.ts'
import { generalAccesses, isGeneralAccess } from './roles.ts'

export const generalAccessLabelId = (access: Schema<'GeneralAccess'>): MessageId => `sharing.general.${access}`

export interface GeneralAccessProps {
  value: Schema<'GeneralAccess'>
  busy: boolean
  onChange: (access: Schema<'GeneralAccess'>) => void
}

/** How the whole workspace can open the document, on top of the roles given one by one. Only an owner gets to see it. */
export function GeneralAccess({ value, busy, onChange }: GeneralAccessProps) {
  const intl = useIntl()

  return (
    <Select
      label={intl.formatMessage({ id: 'sharing.general.label' })}
      value={value}
      aria-disabled={busy || undefined}
      onChange={(event) => {
        const access = event.target.value
        if (!busy && isGeneralAccess(access)) onChange(access)
      }}
    >
      {generalAccesses.map((access) => (
        <option key={access} value={access}>
          {intl.formatMessage({ id: generalAccessLabelId(access) })}
        </option>
      ))}
    </Select>
  )
}
