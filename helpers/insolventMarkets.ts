// The insolvent and stuck sections of tvl-adapter-cache/cache/insolvent-markets/*.json record one
// entry per pool, whose value names the offending reserves in a fixed shape: "SYMBOL: reason",
// several of them joined by " | ". Every entry in the aave and compound caches follows it,
// including awkward ones like "SolvBTC.b", "USDC.e", "oUSDC", "WETH/USDT WLP" and
// "T-2250_2750-WETH-USDC", none of which contain a colon or a pipe.
//
// Returns an empty array for anything it cannot read, which callers treat as "drop the whole pool",
// i.e. the behaviour before reserve-level filtering.
export function parseStuckReserveSymbols(reason: unknown): Array<string> {
  if (typeof reason !== 'string' || !reason.trim()) return []
  const symbols = reason
    .split('|')
    .map(segment => {
      const separator = segment.indexOf(':')
      return separator === -1 ? '' : segment.slice(0, separator).trim()
    })
    .filter(Boolean)
  // A partially parseable reason is not good enough: one unreadable segment
  // would let its reserve through. Treat the whole thing as unreadable.
  if (symbols.length !== reason.split('|').length) return []
  return [...new Set(symbols)]
}

// Collects the symbols named across every reason given for one pool. Returns undefined when any of
// them cannot be read, which means the caller must drop the pool rather than guess.
export function collectNamedSymbols(reasons: Array<unknown>): Array<string> | undefined {
  const symbols = new Set<string>()
  for (const reason of reasons) {
    if (reason === undefined) continue
    const parsed = parseStuckReserveSymbols(reason)
    if (!parsed.length) return undefined
    parsed.forEach(symbol => symbols.add(symbol))
  }
  return [...symbols]
}
