export interface Finding {
  readonly line: number
  readonly rule: string
}

export interface ScanOptions {
  /** The text is source code (`.mjs`, `.js`, `.ts`): an unquoted variable, call or keyword may stand where a secret would. */
  readonly code?: boolean
}

/**
 * What stands where a secret goes in an example, a template or a script: nothing, a marker, a reference to the environment
 * (`${NAME}`, or `${NAME:?message}`, which refuses to go on without it) or a command that makes one. Strict on purpose:
 * `hunter2.prod`, `Summer.2026` and `pa(ss` are passwords, not references.
 */
const placeholder = /^(?:|CHANGE_ME\w*|<[^>]*>|\$\{\w+(?::?\?[^}]*)?\}|\$\(.*\)|\$\$?\w+|["']{2}|true|false)$/

/** A reference that carries a value of its own (`${NAME:-value}`, `${NAME-value}`, `${NAME:=value}`, `${NAME:+value}`). */
const referenceWithValue = /^\$\{\w+:?[-=+]([^}]*)\}$/
/** The same, found anywhere in a line, whatever the name: the value is what is read, never the `-` or `=` before it. */
const valuesOfReferences = /\$\{\w+:?[-=+]([^}]*)\}/g

/**
 * In source code only, and only unquoted (a quoted value is a literal, whatever it looks like): a keyword, a variable of the
 * code (a path of identifiers, none starting with a digit) or a call.
 */
const codePlaceholder = /^(?:(?:null|undefined|true|false)|[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+|[A-Za-z_][\w.]*\(.*)$/

const tokenShapes: ReadonlyArray<readonly [rule: string, shape: RegExp]> = [
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['AWS access key id', /\bAKIA[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['API key', /\bsk-[A-Za-z0-9_-]{20,}/],
  ['JSON web token', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}/],
  ['password hash', /\$(?:2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}|argon2(?:id|i|d)\$)/],
]

// A name that says what it holds. `PASS` and `KEY` count only as a whole word, the end of a name (`DB_PASS`, `SSH_KEY`) or
// the capitalised end of a camelCase one (`dbPass`, `sshKey`): `COMPASS`, `MY_KEYBOARD` and `bypass` are not secrets.
const secretName =
  '\\w*(?:PASSWORD|PASSWD|PGPASS|SECRET|TOKEN|API_?KEY|PRIVATE_?KEY|CREDENTIALS?|(?<![A-Z])PASS(?![A-Z])|_KEY(?![A-Z])|(?-i:(?<=[a-z])(?:Pass|Key)(?![a-z])))\\w*'
// The name, then a value. The value is a reference to the environment or a command (which may hold spaces), or runs to a
// quote, a space, a comma or a semicolon. Group 1 is the quote the value opens with, group 2 the value.
const secretAssignment = new RegExp(
  `(?<![\\w\${])${secretName}["']?\\s*[=:]\\s*(["']?)(\\$\\{[^}]*\\}|\\$\\([^)]*\\)|[^\\s"',;]*)`,
  'gi',
)
// The same name given as a command-line flag with a space or an equals sign: `docker login --password value`.
const secretFlag =
  /--[\w-]*(?:password|passwd|pass|token|secret|api-?key)[\w-]*[= ]\s*(["']?)(\$\{[^}]*\}|\$\([^)]*\)|[^\s"',;|<>&]*)/gi
const urlPassword = /\b[a-z][a-z0-9+.-]*:\/\/(?:\$\{[^}]*\}|[^\s:/@$]+):(\$\{[^}]*\}|[^\s@/]+)@/i
// A long run of the characters of hexadecimal and base64: a key or a hash of one.
const longRandomRun = /(?<![\w/+-])(?:[A-Za-z0-9+/_]-?){32,}={0,2}(?![\w/+=-])/
// None of these is a secret, and all are removed before a line is read: image digests and the commit an action is pinned to
// are public, a marker says that a value is still to be filled in, and a path is long and made of words (a key in base64 has
// capitals).
const imageDigest = /sha256:[0-9a-f]{64}/g
const pinnedCommit = /@[0-9a-f]{40}\b/g
const marker = /CHANGE_ME\w*/g
const lowercasePath = /(?<![\w/+-])\/?(?:[a-z0-9._-]+\/)+[a-z0-9._-]*(?![\w/+=-])/g

const isComment = (line: string): boolean => /^\s*(?:#|\/\/)/.test(line)
// A comment that is a line of an environment file (`# SESSION_SECRET=…`) was a setting before it was commented out, and what
// stands in it is what somebody typed there. A sentence that mentions a password is not.
const commentedSetting = /^\s*(?:#|\/\/)\s*[A-Z_][A-Z0-9_]*\s*[=:]/
// `ENV NAME value` and `ARG NAME value` of a Dockerfile, the form without an equals sign.
const instructionWithoutEquals = /^(\s*(?:ENV|ARG))\s+(\w+)\s+(?!=)(\S.*)$/i

/** The lines of `text` that look like they hold a secret, and the rule each one broke. */
export function findSecrets(text: string, { code = false }: ScanOptions = {}): Finding[] {
  const isPlaceholder = (value: string, quoted: boolean): boolean => {
    // A default is a value somebody typed: it is held to the rules of any other value.
    const defaultValue = referenceWithValue.exec(value)?.[1]
    if (defaultValue !== undefined) return isPlaceholder(defaultValue, quoted)
    return placeholder.test(value) || (code && !quoted && codePlaceholder.test(value))
  }
  return text.split('\n').flatMap((rawLine, index) => {
    const line = rawLine
      .replace(imageDigest, 'sha256:DIGEST')
      .replace(pinnedCommit, '@COMMIT')
      .replace(marker, 'CHANGE_ME')
      .replace(lowercasePath, 'PATH')
      .replace(instructionWithoutEquals, '$1 $2=$3')
    const found = (rule: string): Finding[] => [{ line: index + 1, rule }]
    const token = tokenShapes.find(([, shape]) => shape.test(line))
    if (token !== undefined) return found(token[0])
    const urlSecret = urlPassword.exec(line)?.[1]
    if (urlSecret !== undefined && !isPlaceholder(urlSecret, false)) return found('password in a URL')
    const readsAssignments = !isComment(line) || commentedSetting.test(line)
    const leaked =
      readsAssignments &&
      [...line.matchAll(secretAssignment), ...line.matchAll(secretFlag)].some(
        ([, quote = '', value = '']) => !isPlaceholder(value, quote !== ''),
      )
    if (leaked) return found('secret assigned a value')
    // The `-`, `=` and `+` of a default are in the lookbehind of the run, so a long value after one is read on its own.
    const defaults = [...line.matchAll(valuesOfReferences)].map(([, value = '']) => value)
    return longRandomRun.test(line) || defaults.some((value) => longRandomRun.test(value))
      ? found('long random-looking string')
      : []
  })
}
