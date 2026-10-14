import { createWriteStream, mkdirSync } from 'node:fs'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import type { TestProject } from 'vitest/node'
import { createDatabase } from '../../src/db/database.ts'
import { migrateToLatest } from '../../src/db/migrate.ts'
import { createDatabaseNamed, postgresImage, templateName, urlOfDatabase } from './postgres.ts'

/**
 * One PostgreSQL 17 for the whole run, started by Testcontainers on a random port and removed by it when the run ends.
 * It holds a migrated template, which every test file copies in milliseconds instead of migrating again.
 */
export default async function setup(project: TestProject) {
  // The database's own log, kept beside the test report: what a failed CI run needs to be diagnosed.
  const logFile = new URL('../../test-results/postgres.log', import.meta.url)
  mkdirSync(new URL('.', logFile), { recursive: true })
  const container = await new PostgreSqlContainer(postgresImage())
    .withDatabase('postgres')
    .withLogConsumer((stream) => stream.pipe(createWriteStream(logFile)))
    .start()
  const adminUrl = container.getConnectionUri()

  await createDatabaseNamed(adminUrl, templateName)
  const template = createDatabase(urlOfDatabase(adminUrl, templateName))
  try {
    await migrateToLatest(template)
  } finally {
    // The template must have no open connection, or PostgreSQL refuses to copy it.
    await template.destroy()
  }

  project.provide('postgresAdminUrl', adminUrl)
  return () => container.stop()
}
