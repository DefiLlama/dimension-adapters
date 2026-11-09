import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { MorphoBlues } from '../../fees/morpho/index'

const MorphoBlueAbis = {
  Liquidate: 'event Liquidate(bytes32 indexed id, address indexed caller, address indexed borrower, uint256 repaidAssets, uint256 repaidShares, uint256 seizedAssets, uint256 badDebtAssets, uint256 badDebtShares)',
  idToMarketParams: 'function idToMarketParams(bytes32) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)',
}

const fetch = async (options: FetchOptions) => {
  const dailyCollateralLiquidated = options.createBalances()

  const { blue } = MorphoBlues[options.chain]

  const liquidateEvents = await options.getLogs({
    target: blue,
    eventAbi: MorphoBlueAbis.Liquidate,
  })
  if (!liquidateEvents.length) return { dailyCollateralLiquidated }

  // resolve only the markets liquidated in this window; scanning every CreateMarket from the deploy
  // block is what stalled Unichain and Monad
  const marketIds = [...new Set(liquidateEvents.map((event: any) => String(event.id).toLowerCase()))]
  const marketParams = await options.api.multiCall({
    abi: MorphoBlueAbis.idToMarketParams,
    calls: marketIds.map((id) => ({ target: blue, params: [id] })),
  })
  const collateralToken: Record<string, string> = {}
  marketIds.forEach((id, i) => { collateralToken[id] = marketParams[i].collateralToken })

  for (const event of liquidateEvents) {
    dailyCollateralLiquidated.add(collateralToken[String(event.id).toLowerCase()], event.seizedAssets)
  }

  return { dailyCollateralLiquidated }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: false,
  adapter: Object.fromEntries(
    Object.entries(MorphoBlues)
      .map(([chain, { start }]) => [chain, { fetch, start }])
  ),
  methodology: {
    CollateralLiquidated: 'Total USD value of collateral seized in Morpho Blue Liquidate events.',
  },
}

export default adapter
