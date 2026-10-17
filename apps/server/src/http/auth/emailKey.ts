/** The address of email as a key: one account whatever its case, and however its letters are written. */
export const keyOfEmail = (email: string): string => email.normalize('NFKC').trim().toLowerCase()
