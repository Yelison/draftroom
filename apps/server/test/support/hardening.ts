import type { Hardening } from '../../src/http/app.ts'
import type { RequestLimits } from '../../src/http/request-limits.ts'

/** A server as development runs it: no origin allowed, no proxy trusted, no HSTS. */
export const developmentHardening: Hardening = { production: false, allowedOrigins: [], trustProxy: false }

/** Limits no test reaches by accident: the batteries that call every operation come from one address as one person. */
export const unlimitedRequests: RequestLimits = {
  perAddress: { perSecond: 1_000_000, burst: 1_000_000 },
  perSession: { perSecond: 1_000_000, burst: 1_000_000 },
}
