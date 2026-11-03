import { ethers } from 'ethers'
import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { getMarkets } from '../fees/inverse-finance'

// Inverse Finance FiRM: one Market contract per collateral, borrowers' collateral sits in per-user escrows.
// Market.liquidate pays liquidatorReward (collateral units, incentive included) from the escrow to the liquidator,
// then, when liquidationFeeBps > 0, pays a fee to gov capped at what is left in the escrow. The fee is not in the event.
const LiquidateEvent = 'event Liquidate(address indexed account, address indexed liquidator, uint256 repaidDebt, uint256 liquidatorReward)'
const TransferEvent = 'event Transfer(address indexed from, address indexed to, uint256 value)'
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

const fetch = async (options: FetchOptions) => {
  const dailyCollateralLiquidated = options.createBalances()

  const toBlock = await options.getToBlock()
  const markets = (await getMarkets()).filter((m: any) => m.startingBlock <= toBlock)

  const logs: any[][] = await options.getLogs({ targets: markets.map((m: any) => m.address), eventAbi: LiquidateEvent, flatten: false, entireLog: true, parseLog: true })

  const liquidated = markets.map((m: any, i: number) => ({ ...m, logs: logs[i] })).filter((m: any) => m.logs.length > 0)
  if (!liquidated.length) return { dailyCollateralLiquidated }

  const govs: string[] = await options.api.multiCall({ abi: 'address:gov', calls: liquidated.map((m: any) => m.address) })

  const feeLegs: Record<string, { collaterals: Set<string>, keys: Set<string> }> = {}
  liquidated.forEach((market: any, i: number) => {
    const collateral = market.collateral.toLowerCase()
    const leg = feeLegs[govs[i].toLowerCase()] ??= { collaterals: new Set(), keys: new Set() }
    leg.collaterals.add(collateral)
    for (const log of market.logs) {
      dailyCollateralLiquidated.add(collateral, log.args.liquidatorReward)
      leg.keys.add(`${collateral}-${log.transactionHash.toLowerCase()}`)
    }
  })

  for (const [gov, { collaterals, keys }] of Object.entries(feeLegs)) {
    const feeTransfers = await options.getLogs({
      targets: [...collaterals],
      eventAbi: TransferEvent,
      topics: [TRANSFER_TOPIC, null as any, ethers.zeroPadValue(gov, 32)],
      entireLog: true,
      parseLog: true,
    })
    for (const transfer of feeTransfers) {
      const collateral = transfer.address.toLowerCase()
      if (keys.has(`${collateral}-${transfer.transactionHash.toLowerCase()}`)) dailyCollateralLiquidated.add(collateral, transfer.args.value)
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
