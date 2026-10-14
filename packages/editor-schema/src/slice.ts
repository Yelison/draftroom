import { getSchema } from '@tiptap/core'
import { attributeProblem } from './attributes.ts'
import { editorExtensions } from './extensions.ts'

let schema: ReturnType<typeof getSchema> | undefined

/**
 * Whether the `data-pm-slice` of pasted HTML names only what this schema holds. ProseMirror writes that attribute when
 * it copies, as `openStart openEnd [context]`, where the context lists the nodes that wrapped the copied content, each
 * with its attributes; on paste it builds those nodes as given, without the HTML rules that limit them. A context with a
 * node that is not in the schema, or with attributes the schema does not allow (a heading of level 1), is not accepted.
 */
export function isAllowedSliceContext(attribute: string): boolean {
  const parts = /^\d+ \d+(?: -\d+)? (.*)$/s.exec(attribute)
  if (parts === null || parts[1] === undefined) return false
  let context: unknown
  try {
    context = JSON.parse(parts[1])
  } catch {
    return false
  }
  if (!Array.isArray(context) || context.length % 2 !== 0) return false
  schema ??= getSchema(editorExtensions())
  for (let index = 0; index < context.length; index += 2) {
    const name: unknown = context[index]
    const attrs: unknown = context[index + 1]
    const type = typeof name === 'string' ? schema.nodes[name] : undefined
    if (type === undefined || type.isText || type === schema.topNodeType) return false
    if (attrs === null) continue
    if (typeof attrs !== 'object' || Array.isArray(attrs)) return false
    const known = new Set(Object.keys(type.spec.attrs ?? {}))
    if (!Object.keys(attrs).every((key) => known.has(key))) return false
    if (attributeProblem(name as string, attrs as Record<string, unknown>) !== null) return false
  }
  return true
}
