import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { getConfig } from '../helpers/cache'

// Inverse Finance FiRM: one Market contract per collateral, borrowers' collateral sits in per-user escrows.
// Market.liquidate pays liquidatorReward (collateral units, incentive included) from the escrow to the liquidator,
// then pays a further liquidationFee to gov when liquidationFeeBps > 0. The fee is not in the event.
const LiquidateEvent = 'event Liquidate(address indexed account, address indexed liquidator, uint256 repaidDebt, uint256 liquidatorReward)'

const abis = {
  liquidationIncentiveBps: 'uint256:liquidationIncentiveBps',
  liquidationFeeBps: 'uint256:liquidationFeeBps',
}

// same market list as fees/inverse-finance
const getMarkets = async (): Promise<{ address: string, collateral: string, startingBlock: number }[]> => {
  const data = await getConfig('inverse-finance/markets', 'https://www.inverse.finance/api/defillama/simple-market-list')
  return data.markets
}

const fetch = async (options: FetchOptions) => {
  const dailyCollateralLiquidated = options.createBalances()

  const toBlock = await options.getToBlock()
  const markets = (await getMarkets()).filter(m => m.startingBlock <= toBlock)

  const logs: any[][] = await options.getLogs({ targets: markets.map(m => m.address), eventAbi: LiquidateEvent, flatten: false })

  const liquidated = markets.map((m, i) => ({ ...m, logs: logs[i] })).filter(m => m.logs.length > 0)
  if (!liquidated.length) return { dailyCollateralLiquidated }

  const [incentives, fees] = await Promise.all([
    options.api.multiCall({ abi: abis.liquidationIncentiveBps, calls: liquidated.map(m => m.address) }),
    options.api.multiCall({ abi: abis.liquidationFeeBps, calls: liquidated.map(m => m.address) }),
  ])

  liquidated.forEach((market, i) => {
    const incentiveBps = BigInt(incentives[i])
    const feeBps = BigInt(fees[i])
    for (const log of market.logs) {
      const reward = BigInt(log.liquidatorReward)
      // liquidatorReward = base * (1 + incentive), liquidationFee = base * feeBps; the fee is capped by the escrow balance on-chain
      const fee = feeBps > 0n ? reward * feeBps / (10000n + incentiveBps) : 0n
      dailyCollateralLiquidated.add(market.collateral, reward + fee)
    }
  })

  return { dailyCollateralLiquidated }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: '2022-12-11' },
  },
  methodology: {
    CollateralLiquidated: 'Total USD value of collateral seized in FiRM Market Liquidate events: liquidatorReward plus the liquidation fee paid to the DAO on markets where liquidationFeeBps is set.',
  },
}

export default adapter
