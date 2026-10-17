import { useMutation } from '@tanstack/react-query'
import { Button, Input } from '@yelison/forma-ui'
import { useRef, useState, type SubmitEvent } from 'react'
import { useIntl } from 'react-intl'
import { Link, useLocation } from 'react-router'
import { isApiError } from '../../data/errors.ts'
import { useDataSource } from '../../data/useDataSource.ts'
import { AuthCard } from './AuthCard.tsx'
import { signInFailureMessage } from './authProblem.ts'
import { emailProblem, passwordLimits, signInPasswordProblem } from './validation.ts'
import { useStartSession } from './useStartSession.tsx'
import styles from './Auth.module.css'

/** Signing in with an email and a password. What the server refuses is said by its `code`, in the person's language. */
export function SignInScreen() {
  const intl = useIntl()
  const location = useLocation()
  const dataSource = useDataSource()
  const { start, dialogs } = useStartSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [problems, setProblems] = useState<{
    email: ReturnType<typeof emailProblem>
    password: ReturnType<typeof signInPasswordProblem>
  }>({ email: null, password: null })
  const emailInput = useRef<HTMLInputElement>(null)
  const passwordInput = useRef<HTMLInputElement>(null)

  const signIn = useMutation({
    mutationFn: async (credentials: { email: string; password: string }) =>
      start(await dataSource.signIn({ body: credentials })),
    onError: (error) => {
      // A password that was not right is typed again, from the start: the field is empty and has the focus.
      if (isApiError(error, 'unauthenticated')) {
        setPassword('')
        passwordInput.current?.focus()
      }
    },
  })

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (signIn.isPending) return
    const found = { email: emailProblem(email), password: signInPasswordProblem(password) }
    setProblems(found)
    if (found.email !== null) return emailInput.current?.focus()
    if (found.password !== null) return passwordInput.current?.focus()
    signIn.mutate({ email, password })
  }

  return (
    <AuthCard
      titleId="auth.signIn.title"
      descriptionId="auth.signIn.description"
      footer={intl.formatMessage(
        { id: 'auth.signIn.toSignUp' },
        {
          link: (chunks) => (
            <Link to="/sign-up" state={location.state}>
              {chunks}
            </Link>
          ),
        },
      )}
    >
      <form className={styles.form} onSubmit={submit} noValidate>
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
          autoComplete="current-password"
          label={intl.formatMessage({ id: 'auth.password.label' })}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={
            problems.password === null
              ? undefined
              : intl.formatMessage({ id: `auth.password.${problems.password}` }, { max: passwordLimits.max })
          }
        />
        {signIn.error !== null && (
          <p role="alert" className={styles.problem}>
            {intl.formatMessage({ id: signInFailureMessage(signIn.error) })}
          </p>
        )}
        <Button type="submit" loading={signIn.isPending}>
          {intl.formatMessage({ id: 'auth.signIn.submit' })}
        </Button>
      </form>
      {dialogs}
    </AuthCard>
  )
}
