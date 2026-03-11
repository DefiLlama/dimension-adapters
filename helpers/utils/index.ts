

export function getDateString(timestamp: number) {
  return new Date(timestamp * 1000).toISOString().slice(0, '2011-10-05'.length)
}