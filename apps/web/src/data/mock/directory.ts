import type { PersonRecord } from './fixtures/people.ts'
import { invalid } from './problems.ts'
import type { World } from './world.ts'

/** Emails are the same person whatever their case. */
export function findPerson(world: World, email: string): PersonRecord | undefined {
  return world.people.find((person) => person.email.toLowerCase() === email.toLowerCase())
}

/** A person with no account yet: someone invited by email, who keeps this `userId` when they sign up. */
export function addPendingPerson(world: World, email: string): PersonRecord {
  const person: PersonRecord = {
    id: world.newId(),
    email,
    name: null,
    password: null,
    locale: null,
    editorTextSize: 'medium',
  }
  world.people.push(person)
  return person
}

export function checkEmailFormat(email: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid({ pointer: '/email', code: 'invalid-format' })
}
