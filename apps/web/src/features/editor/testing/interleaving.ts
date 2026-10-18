/** Whether `merged` is `first` and `second` woven together, each in its own order, with no letter added or lost. */
export function isInterleavingOf(merged: string, first: string, second: string): boolean {
  if (merged.length !== first.length + second.length) return false
  // `woven[i][j]`: the first `i + j` letters of `merged` are made of the first `i` letters of `first` and the first `j` of `second`.
  const woven = Array.from({ length: first.length + 1 }, (_row, i) =>
    Array.from({ length: second.length + 1 }, (_cell, j) => i === 0 && j === 0),
  )
  const isWoven = (i: number, j: number) => woven[i]?.[j] === true
  for (let i = 0; i <= first.length; i++) {
    const row = woven[i]
    for (let j = 0; j <= second.length && row !== undefined; j++) {
      const letter = merged[i + j - 1]
      const endsInFirst = i > 0 && isWoven(i - 1, j) && first[i - 1] === letter
      const endsInSecond = j > 0 && isWoven(i, j - 1) && second[j - 1] === letter
      if (endsInFirst || endsInSecond) row[j] = true
    }
  }
  return isWoven(first.length, second.length)
}
