import { Radio } from '@yelison/forma-ui'
import { useId, type ReactNode } from 'react'
import styles from './Settings.module.css'

export interface ChoiceGroupProps<Value extends string> {
  legend: string
  /** Shared by the radios of the group, which is what makes the arrow keys move between them. */
  name: string
  value: Value
  options: readonly { value: Value; label: ReactNode }[]
  /** A change is on its way: the choice stays as it is, still reachable, until the answer comes. */
  busy?: boolean
  /** The choices side by side, for a group of few short words, instead of one under the other. */
  inline?: boolean
  /** Why the choice was not stored, tied to the group so that it is read with it and said when it appears. */
  error?: string | undefined
  onChange: (value: Value) => void
}

/** One choice out of a few, as a group of radios under a legend. */
export function ChoiceGroup<Value extends string>({
  legend,
  name,
  value,
  options,
  busy = false,
  inline = false,
  error,
  onChange,
}: ChoiceGroupProps<Value>) {
  const errorId = useId()

  return (
    <fieldset
      className={inline ? `${styles.group} ${styles.inline}` : styles.group}
      aria-describedby={error === undefined ? undefined : errorId}
    >
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
      {error !== undefined && (
        <p id={errorId} role="alert" className={styles.problem}>
          {error}
        </p>
      )}
    </fieldset>
  )
}
