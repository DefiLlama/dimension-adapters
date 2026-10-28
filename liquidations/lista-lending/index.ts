import { CHAIN } from '../../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../../adapters/types'

// Lista Lending (Moolah) is a Morpho Blue fork; Liquidate has the same signature as Morpho Blue's
const MOOLAH: Record<string, string> = {
  [CHAIN.BSC]: '0x8F73b65B4caAf64FBA2aF91cC5D4a2A1318E5D8C',
  [CHAIN.ETHEREUM]: '0xf820fB4680712CD7263a0D3D024D5b5aEA82Fd70',
}

const abis = {
  Liquidate: 'event Liquidate(bytes32 indexed id, address indexed caller, address indexed borrower, uint256 repaidAssets, uint256 repaidShares, uint256 seizedAssets, uint256 badDebtAssets, uint256 badDebtShares)',
  idToMarketParams: 'function idToMarketParams(bytes32) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)',
}

const fetch = async (options: FetchOptions) => {
  const dailyCollateralLiquidated = options.createBalances()
  const moolah = MOOLAH[options.chain]

  const events: any[] = await options.getLogs({ target: moolah, eventAbi: abis.Liquidate })
  if (!events.length) return { dailyCollateralLiquidated }

  const marketIds = [...new Set(events.map((e) => String(e.id).toLowerCase()))]
  const params = await options.api.multiCall({
    abi: abis.idToMarketParams,
    calls: marketIds.map((id) => ({ target: moolah, params: [id] })),
  })
  const collateralToken: Record<string, string> = {}
  marketIds.forEach((id, i) => { collateralToken[id] = params[i].collateralToken })

  for (const event of events) {
    dailyCollateralLiquidated.add(collateralToken[String(event.id).toLowerCase()], event.seizedAssets)
  }

  return { dailyCollateralLiquidated }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.BSC]: { start: '2025-04-16' },
    [CHAIN.ETHEREUM]: { start: '2025-10-02' },
  },
  methodology: {
    CollateralLiquidated: 'Total USD value of collateral seized in Moolah Liquidate events, priced in each market\'s collateral token.',
  },
}

export default adapter
