import { FetchOptions } from '../../adapters/types'

// Controller.Liquidate from crvUSD and LlamaLend (v1 and v2). collateral_received and stablecoin_received are the two halves of the
// user's LLAMMA position (xy[1] collateral, xy[0] borrowed token that soft liquidation had already converted), both taken off the user.
const Liquidate = 'event Liquidate(address indexed liquidator, address indexed user, uint256 collateral_received, uint256 stablecoin_received, uint256 debt)'

export type LlammaMarket = { controller: string; collateral: string; borrowed: string }

type LiquidateEvent = { liquidator: string; user: string; collateral_received: bigint; stablecoin_received: bigint; debt: bigint }
type NewVaultEvent = { id: bigint; collateral_token: string; borrowed_token: string; vault: string; controller: string; amm: string; price_oracle: string; monetary_policy: string }

/**
 * Sums hard liquidations across LLAMMA controllers for the fetch window.
 * @param markets controller address plus its collateral and borrowed token
 * @returns dailyCollateralLiquidated with both halves of each liquidated position (collateral and borrowed token)
 */
export async function fetchLlammaLiquidations(options: FetchOptions, markets: LlammaMarket[]) {
  const dailyCollateralLiquidated = options.createBalances()
  if (!markets.length) return { dailyCollateralLiquidated }

  const logs = await options.getLogs({ targets: markets.map((m) => m.controller), eventAbi: Liquidate, flatten: false })
  logs.forEach((events: LiquidateEvent[], i: number) => {
    const { collateral, borrowed } = markets[i]
    for (const event of events) {
      // liquidate() called by the borrower on their own loan skips the health check, it is a voluntary close, not a liquidation
      if (event.liquidator.toLowerCase() === event.user.toLowerCase()) continue
      dailyCollateralLiquidated.add(collateral, event.collateral_received)
      dailyCollateralLiquidated.add(borrowed, event.stablecoin_received)
    }
  })

  return { dailyCollateralLiquidated }
}

const NewVault = 'event NewVault(uint256 indexed id, address indexed collateral_token, address indexed borrowed_token, address vault, address controller, address amm, address price_oracle, address monetary_policy)'

/**
 * Lists LlamaLend one-way lending markets from a factory's NewVault events (v1 and v2 share the event).
 * @param factory factory address, the block to scan from, and optional vault addresses to drop
 * @returns one market per vault that is not blacklisted
 */
export async function getLlamaLendMarkets(options: FetchOptions, factory: { address: string; fromBlock: number; blacklists?: string[] }): Promise<LlammaMarket[]> {
  const vaults: NewVaultEvent[] = await options.getLogs({ target: factory.address, eventAbi: NewVault, fromBlock: factory.fromBlock, cacheInCloud: true })
  const blacklist = new Set((factory.blacklists ?? []).map((a) => a.toLowerCase()))
  return vaults
    .filter((v) => !blacklist.has(v.vault.toLowerCase()))
    .map((v) => ({ controller: v.controller, collateral: v.collateral_token, borrowed: v.borrowed_token }))
}
