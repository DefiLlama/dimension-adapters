import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { MorphoBlues } from '../../fees/morpho/index'

// stalls on these chains
const SKIP_CHAINS = new Set<string>([CHAIN.UNICHAIN, CHAIN.MONAD])

const MorphoBlueAbis = {
  Liquidate: 'event Liquidate(bytes32 indexed id, address indexed caller, address indexed borrower, uint256 repaidAssets, uint256 repaidShares, uint256 seizedAssets, uint256 badDebtAssets, uint256 badDebtShares)',
  CreateMarket: 'event CreateMarket(bytes32 indexed id, tuple(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams)',
}

const fetch = async (options: FetchOptions) => {
  const dailyLiquidationCollateral = options.createBalances()
  const dailyLiquidationDebtRepaid = options.createBalances()

  const { blue, fromBlock } = MorphoBlues[options.chain]

  const createMarketEvents = await options.getLogs({
    target: blue,
    eventAbi: MorphoBlueAbis.CreateMarket,
    fromBlock,
    cacheInCloud: true,
  })

  const marketMap: Record<string, { loanToken: string; collateralToken: string }> = {}
  for (const event of createMarketEvents) {
    marketMap[String(event.id).toLowerCase()] = {
      loanToken: event.marketParams.loanToken,
      collateralToken: event.marketParams.collateralToken,
    }
  }

  const liquidateEvents = await options.getLogs({
    target: blue,
    eventAbi: MorphoBlueAbis.Liquidate,
  })

  for (const event of liquidateEvents) {
    const market = marketMap[String(event.id).toLowerCase()]
    if (!market) continue

    if (market.collateralToken) {
      dailyLiquidationCollateral.add(market.collateralToken, event.seizedAssets)
    }
    if (market.loanToken) {
      dailyLiquidationDebtRepaid.add(market.loanToken, event.repaidAssets)
    }
  }

  return { dailyLiquidationCollateral, dailyLiquidationDebtRepaid }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: false,
  adapter: Object.fromEntries(
    Object.entries(MorphoBlues)
      .filter(([chain]) => !SKIP_CHAINS.has(chain))
      .map(([chain, { start }]) => [chain, { fetch, start }])
  ),
  methodology: {
    LiquidationCollateral: 'Total USD value of collateral seized in Morpho Blue Liquidate events.',
    LiquidationDebtRepaid: 'Total USD value of debt repaid in Morpho Blue Liquidate events.',
  },
}

export default adapter
