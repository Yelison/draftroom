/**
 * How something the person asked for ended: it worked, or it did not and this is what to tell them, already in their
 * language. The card never reads a refusal of the API: the screen that owns the request knows what it means.
 */
export type Outcome = { ok: true } | { ok: false; message: string }

export const succeeded: Outcome = { ok: true }
