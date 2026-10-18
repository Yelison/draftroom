import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { z } from 'zod'
import { loadConfig } from '../../src/config.ts'
import { deploy } from './caddy.ts'

// The production Compose file fixes the subnet of its network and tells the server to believe `X-Forwarded-For` from it and
// from nowhere else (ADR 0017). Were either missing or the two different, every request would come from the proxy and the
// limit of one address would be everybody's. That two people behind the proxy really get a limit each is the drill's last step.

const compose = z
  .object({
    services: z.object({ server: z.object({ environment: z.record(z.string(), z.string()) }) }),
    networks: z.object({
      default: z.object({ ipam: z.object({ config: z.array(z.object({ subnet: z.string() })) }) }),
    }),
  })
  .parse(parse(readFileSync(join(deploy, 'docker-compose.prod.yml'), 'utf8')))

describe('the production Compose file', () => {
  const [network] = compose.networks.default.ipam.config
  const trusted = compose.services.server.environment['TRUST_PROXY']

  it('fixes the subnet of its network, which Compose would otherwise choose at the first start', () => {
    expect(compose.networks.default.ipam.config).toHaveLength(1)
    expect(network?.subnet).toMatch(/^\d+\.\d+\.\d+\.\d+\/\d+$/)
  })

  it('trusts that subnet as the proxy, which is what the server reads the address of a person from', () => {
    expect(trusted).toBe(network?.subnet)
  })

  it('is a TRUST_PROXY the server accepts in production, and one that does not trust everybody', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://draftroom:draftroom@postgres:5432/draftroom',
      SESSION_SECRET: 'a-secret-of-at-least-thirty-two-characters',
      ALLOWED_ORIGINS: 'https://draftroom.example',
      ...(trusted === undefined ? {} : { TRUST_PROXY: trusted }),
    })

    expect(config.trustProxy).toEqual([network?.subnet])
  })
})
