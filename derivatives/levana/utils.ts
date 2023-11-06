export function dateStr(timestamp: number): string {
    const date = new Date(timestamp * 1000)
    return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`
}