import { ethers } from 'ethers'
import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { getConfig } from '../helpers/cache'

// Inverse Finance FiRM: one Market contract per collateral, borrowers' collateral sits in per-user escrows.
// Market.liquidate pays liquidatorReward (collateral units, incentive included) from the escrow to the liquidator,
// then, when liquidationFeeBps > 0, pays a fee to gov capped at what is left in the escrow. The fee is not in the event.
const LiquidateEvent = 'event Liquidate(address indexed account, address indexed liquidator, uint256 repaidDebt, uint256 liquidatorReward)'
const TransferEvent = 'event Transfer(address indexed from, address indexed to, uint256 value)'
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

// same market list as fees/inverse-finance
const getMarkets = async (): Promise<{ address: string, collateral: string, startingBlock: number }[]> => {
  const data = await getConfig('inverse-finance/markets', 'https://www.inverse.finance/api/defillama/simple-market-list')
  return data.markets
}

const fetch = async (options: FetchOptions) => {
  const dailyCollateralLiquidated = options.createBalances()

  const toBlock = await options.getToBlock()
  const markets = (await getMarkets()).filter(m => m.startingBlock <= toBlock)

  const logs: any[][] = await options.getLogs({ targets: markets.map(m => m.address), eventAbi: LiquidateEvent, flatten: false, entireLog: true, parseLog: true })

  const liquidated = markets.map((m, i) => ({ ...m, logs: logs[i] })).filter(m => m.logs.length > 0)
  if (!liquidated.length) return { dailyCollateralLiquidated }

  const govs: string[] = await options.api.multiCall({ abi: 'address:gov', calls: liquidated.map(m => m.address) })

  for (const [i, market] of liquidated.entries()) {
    for (const log of market.logs) dailyCollateralLiquidated.add(market.collateral, log.args.liquidatorReward)

    // the liquidation fee is whatever collateral reached gov inside the liquidation transactions
    const liquidationTxs = new Set(market.logs.map(log => log.transactionHash.toLowerCase()))
    const feeTransfers = await options.getLogs({
      target: market.collateral,
      eventAbi: TransferEvent,
      topics: [TRANSFER_TOPIC, null as any, ethers.zeroPadValue(govs[i], 32)],
      entireLog: true,
      parseLog: true,
    })
    for (const transfer of feeTransfers) {
      if (liquidationTxs.has(transfer.transactionHash.toLowerCase())) dailyCollateralLiquidated.add(market.collateral, transfer.args.value)
    }
  }

  return { dailyCollateralLiquidated }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2022-12-11',
  methodology: {
    CollateralLiquidated: 'Total USD value of collateral seized in FiRM Market Liquidate events: liquidatorReward plus the liquidation fee transferred to the DAO in the same transaction on markets where liquidationFeeBps is set.',
  },
}

export default adapter
