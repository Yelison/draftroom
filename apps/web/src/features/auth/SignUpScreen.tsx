import { contractLimits } from '@draftroom/contract'
import { useMutation } from '@tanstack/react-query'
import { Button, Input } from '@yelison/forma-ui'
import { useRef, useState, type SubmitEvent } from 'react'
import { useIntl } from 'react-intl'
import { Link, useLocation } from 'react-router'
import { useDataSource } from '../../data/useDataSource.ts'
import { textProblem } from '../documents/actions/textProblem.ts'
import { AuthCard } from './AuthCard.tsx'
import { signUpFailureMessage } from './authProblem.ts'
import { emailProblem, passwordLimits, signUpPasswordProblem } from './validation.ts'
import { useStartSession } from './useStartSession.tsx'
import styles from './Auth.module.css'

/** Creating an account. An address that was invited to a workspace is claimed by it: the server joins the two. */
export function SignUpScreen() {
  const intl = useIntl()
  const location = useLocation()
  const dataSource = useDataSource()
  const { start, dialogs } = useStartSession()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [problems, setProblems] = useState<{
    name: ReturnType<typeof textProblem>
    email: ReturnType<typeof emailProblem>
    password: ReturnType<typeof signUpPasswordProblem>
  }>({ name: null, email: null, password: null })
  const nameInput = useRef<HTMLInputElement>(null)
  const emailInput = useRef<HTMLInputElement>(null)
  const passwordInput = useRef<HTMLInputElement>(null)

  const signUp = useMutation({
    mutationFn: async (account: { name: string; email: string; password: string }) =>
      start(await dataSource.signUp({ body: account })),
  })

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (signUp.isPending) return
    const found = {
      name: textProblem(name, contractLimits.personName),
      email: emailProblem(email),
      password: signUpPasswordProblem(password),
    }
    setProblems(found)
    // The first field with something to fix has the focus, and its error is said as it appears.
    if (found.name !== null) return nameInput.current?.focus()
    if (found.email !== null) return emailInput.current?.focus()
    if (found.password !== null) return passwordInput.current?.focus()
    signUp.mutate({ name: name.trim(), email: email.trim(), password })
  }

  return (
    <AuthCard
      titleId="auth.signUp.title"
      descriptionId="auth.signUp.description"
      footer={intl.formatMessage(
        { id: 'auth.signUp.toSignIn' },
        {
          link: (chunks) => (
            <Link to="/sign-in" state={location.state}>
              {chunks}
            </Link>
          ),
        },
      )}
    >
      <form className={styles.form} onSubmit={submit} noValidate>
        <Input
          ref={nameInput}
          name="name"
          autoComplete="name"
          label={intl.formatMessage({ id: 'auth.signUp.name.label' })}
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={
            problems.name === null
              ? undefined
              : intl.formatMessage({ id: `auth.signUp.name.${problems.name}` }, { max: contractLimits.personName.max })
          }
        />
        <Input
          ref={emailInput}
          name="email"
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          label={intl.formatMessage({ id: 'auth.email.label' })}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={
            problems.email === null
              ? undefined
              : intl.formatMessage({ id: `auth.email.${problems.email}` }, { max: 254 })
          }
        />
        <Input
          ref={passwordInput}
          name="password"
          type="password"
          autoComplete="new-password"
          label={intl.formatMessage({ id: 'auth.password.label' })}
          hint={intl.formatMessage({ id: 'auth.signUp.password.hint' }, { min: passwordLimits.min })}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={
            problems.password === null
              ? undefined
              : intl.formatMessage(
                  {
                    id:
                      problems.password === 'tooShort'
                        ? 'auth.signUp.password.tooShort'
                        : `auth.password.${problems.password}`,
                  },
                  { min: passwordLimits.min, max: passwordLimits.max },
                )
          }
        />
        {signUp.error !== null && (
          <p role="alert" className={styles.problem}>
            {intl.formatMessage({ id: signUpFailureMessage(signUp.error) })}
          </p>
        )}
        <Button type="submit" loading={signUp.isPending}>
          {intl.formatMessage({ id: 'auth.signUp.submit' })}
        </Button>
      </form>
      {dialogs}
    </AuthCard>
  )
}
