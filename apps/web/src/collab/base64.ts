/** Standard base64 with padding, the encoding the protocol uses for a Yjs snapshot (`stored`) and for relative positions. */

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  // Chunked, because spreading a large array into `String.fromCharCode` overflows the call stack.
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000))
  }
  return btoa(binary)
}

/** The bytes of a base64 text, or `null` when it is not base64. */
export function fromBase64(text: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(text), (character) => character.charCodeAt(0))
  } catch {
    return null
  }
}
