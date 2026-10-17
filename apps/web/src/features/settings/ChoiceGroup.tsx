import { Radio } from '@yelison/forma-ui'
import type { ReactNode } from 'react'
import styles from './Settings.module.css'

export interface ChoiceGroupProps<Value extends string> {
  legend: string
  /** Shared by the radios of the group, which is what makes the arrow keys move between them. */
  name: string
  value: Value
  options: readonly { value: Value; label: ReactNode }[]
  /** A change is on its way: the choice stays as it is, still reachable, until the answer comes. */
  busy?: boolean
  onChange: (value: Value) => void
}

/** One choice out of a few, as a group of radios under a legend. */
export function ChoiceGroup<Value extends string>({
  legend,
  name,
  value,
  options,
  busy = false,
  onChange,
}: ChoiceGroupProps<Value>) {
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>{legend}</legend>
      {options.map((option) => (
        <Radio
          key={option.value}
          name={name}
          value={option.value}
          checked={option.value === value}
          aria-disabled={busy || undefined}
          onChange={() => {
            if (!busy) onChange(option.value)
          }}
          label={option.label}
        />
      ))}
    </fieldset>
  )
}
