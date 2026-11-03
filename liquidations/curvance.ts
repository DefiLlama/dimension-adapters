import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'

// Curvance: the debt cToken calls seize() on the collateral cToken, which moves the borrower's
// collateral shares to the liquidator and emits Liquidated(shares, liquidator, account).
// There is no protocol cut, every seized share goes to the liquidator.
const LiquidatedEvent = 'event Liquidated(uint256 shares, address liquidator, address account)'

const abis = {
  marketManagers: 'address[]:marketManagers',
  queryTokensListed: 'address[]:queryTokensListed',
  asset: 'address:asset',
  convertToAssets: 'function convertToAssets(uint256 shares) view returns (uint256)',
}

// same central registry as fees/curvance
const configs: Record<string, { start: string, centralRegistry: string }> = {
  [CHAIN.MONAD]: { start: '2025-11-26', centralRegistry: '0x1310f352f1389969Ece6741671c4B919523912fF' },
}

const fetch = async (options: FetchOptions) => {
  const dailyCollateralLiquidated = options.createBalances()

  const managers: string[] = await options.api.call({ abi: abis.marketManagers, target: configs[options.chain].centralRegistry })
  const cTokens: string[] = (await options.api.multiCall({ abi: abis.queryTokensListed, calls: managers })).flat()

  const logs: any[][] = await options.getLogs({ targets: cTokens, eventAbi: LiquidatedEvent, flatten: false })

  const seized = cTokens
    .map((cToken, i) => ({ cToken, shares: logs[i].reduce((sum, log) => sum + BigInt(log.shares), 0n) }))
    .filter(s => s.shares > 0n)
  if (!seized.length) return { dailyCollateralLiquidated }

  const [assets, amounts] = await Promise.all([
    options.api.multiCall({ abi: abis.asset, calls: seized.map(s => s.cToken) }),
    options.api.multiCall({ abi: abis.convertToAssets, calls: seized.map(s => ({ target: s.cToken, params: [s.shares.toString()] })) }),
  ])

  seized.forEach((_, i) => dailyCollateralLiquidated.add(assets[i], amounts[i]))

  return { dailyCollateralLiquidated }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: configs,
  methodology: {
    CollateralLiquidated: 'Total USD value of collateral seized in Curvance liquidations, from the Liquidated events emitted by the collateral cToken, converted from cToken shares to the underlying asset.',
  },
}

export default adapter
