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
  const container = await new PostgreSqlContainer(postgresImage()).withDatabase('postgres').start()
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
