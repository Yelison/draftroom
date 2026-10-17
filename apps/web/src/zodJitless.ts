import { config } from 'zod'

// Zod compiles a faster parser for each object schema with `new Function`, and first checks that it may by trying one.
// Under a content security policy with no `unsafe-eval` the attempt fails harmlessly, but the browser reports it as a
// violation and logs an error in every visitor's console. The parsers here read a handful of small messages, so the
// plain ones are as fast as the person can tell, and the policy of the page (scripts/content-security-policy.ts) stays
// free of `unsafe-eval`. This module is imported first by the entry point, before any schema is built.
config({ jitless: true })
