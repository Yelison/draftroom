export interface Finding {
  readonly line: number
  readonly rule: string
}

/**
 * What stands where a secret goes in an example, a template or a script: nothing, a marker, a reference to the environment
 * or to a variable of the code (a dotted path), a command that makes one, a call, or a keyword.
 */
const placeholder =
  /^(?:|CHANGE_ME\w*|<[^>]*>|\$\{[^}]*\}|\$\(.*\)|\$\$?\w+|["']{2}|(?:null|undefined|true|false)|[A-Za-z_]\w*(?:\.\w+)+|.*\(.*)$/

const tokenShapes: ReadonlyArray<readonly [rule: string, shape: RegExp]> = [
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['AWS access key id', /\bAKIA[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['API key', /\bsk-[A-Za-z0-9_-]{20,}/],
  ['JSON web token', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}/],
]

// A name that says what it holds, then a value. The value is a reference to the environment, which may hold spaces, or
// runs to a quote or to a space.
const secretAssignment =
  /(?<![\w${])\w*(?:PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|PRIVATE_?KEY|CREDENTIALS?)\w*["']?\s*[=:]\s*["']?(\$\{[^}]*\}|\$\([^)]*\)|[^\s"',;]*)/i
const urlPassword = /\b[a-z][a-z0-9+.-]*:\/\/(?:\$\{[^}]*\}|[^\s:/@$]+):(\$\{[^}]*\}|[^\s@/]+)@/i
// A long run of the characters of hexadecimal and base64: a key or a hash of one.
const longRandomRun = /(?<![\w/+-])(?:[A-Za-z0-9+/_]-?){32,}={0,2}(?![\w/+=-])/
// None of these is a secret, and all are removed before a line is read: image digests are public, a marker says that a
// value is still to be filled in, and a path is long and made of words (a key in base64 has capitals).
const imageDigest = /sha256:[0-9a-f]{64}/g
const marker = /CHANGE_ME\w*/g
const lowercasePath = /(?<![\w/+=-])\/?(?:[a-z0-9._-]+\/)+[a-z0-9._-]*(?![\w/+=-])/g

const isComment = (line: string): boolean => /^\s*(?:#|\/\/)/.test(line)

/** The lines of `text` that look like they hold a secret, and the rule each one broke. */
export function findSecrets(text: string): Finding[] {
  return text.split('\n').flatMap((rawLine, index) => {
    const line = rawLine
      .replace(imageDigest, 'sha256:DIGEST')
      .replace(marker, 'CHANGE_ME')
      .replace(lowercasePath, 'PATH')
    const found = (rule: string): Finding[] => [{ line: index + 1, rule }]
    const token = tokenShapes.find(([, shape]) => shape.test(line))
    if (token !== undefined) return found(token[0])
    const urlSecret = urlPassword.exec(line)?.[1]
    if (urlSecret !== undefined && !placeholder.test(urlSecret)) return found('password in a URL')
    // A comment may talk about a password (`password=letters-and-digits`), but a value left in one is still a leak.
    const assigned = isComment(line) ? undefined : secretAssignment.exec(line)?.[1]
    if (assigned !== undefined && !placeholder.test(assigned)) return found('secret assigned a value')
    return longRandomRun.test(line) ? found('long random-looking string') : []
  })
}
