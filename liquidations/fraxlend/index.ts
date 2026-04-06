import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'

const Liquidate = 'event Liquidate(address indexed borrower, uint256 collateralForLiquidator, uint256 sharesToLiquidate, uint256 amountLiquidatorToRepay, uint256 feesAmount, uint256 sharesToAdjust, uint256 amountToAdjust)'

const registries: Record<string, string> = {
  [CHAIN.ETHEREUM]: '0xD6E9D27C75Afd88ad24Cd5EdccdC76fd2fc3A751',
  [CHAIN.ARBITRUM]: '0x0bD2fFBcB0A17De2d5a543ec2D47C772eeaD316d',
  [CHAIN.FRAXTAL]: '0x8c22EBc8f9B96cEac97EA21c53F3B27ef2F45e57',
}

const fetch = async (options: FetchOptions) => {
  const dailyLiquidations = options.createBalances()
  const dailyLiquidationRepaidDebt = options.createBalances()

  const pairs: string[] = await options.api.call({
    target: registries[options.chain],
    abi: 'function getAllPairAddresses() view returns (address[])',
  })

  const [borrowAssets, collateralAssets] = await Promise.all([
    options.api.multiCall({ calls: pairs, abi: 'address:asset', permitFailure: true }),
    options.api.multiCall({ calls: pairs, abi: 'address:collateralContract', permitFailure: true }),
  ])

  await Promise.all(
    pairs.map(async (pair, i) => {
      const borrowAsset = borrowAssets[i]
      const collateralAsset = collateralAssets[i]
      if (!borrowAsset || !collateralAsset) return

      const events = await options.getLogs({ target: pair, eventAbi: Liquidate })
      for (const event of events) {
        dailyLiquidations.add(collateralAsset, event.collateralForLiquidator)
        dailyLiquidationRepaidDebt.add(borrowAsset, event.amountLiquidatorToRepay)
      }
    })
  )

  return { dailyLiquidations, dailyLiquidationRepaidDebt }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: '2022-11-18' },
    [CHAIN.ARBITRUM]: { fetch, start: '2023-05-20' },
    [CHAIN.FRAXTAL]: { fetch, start: '2024-02-22' },
  },
  methodology: {
    Liquidations: 'Total USD value of collateral seized in Fraxlend Liquidate events.',
    LiquidationRepaidDebt: 'Total USD value of debt repaid in Fraxlend Liquidate events.',
  },
}

export default adapter
