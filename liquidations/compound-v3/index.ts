import { CHAIN } from '../../helpers/chains'
import { BaseAdapter, FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CometAddresses } from '../../fees/compound-v3'

const AbsorbCollateralEvent = 'event AbsorbCollateral(address indexed absorber, address indexed borrower, address indexed asset, uint256 collateralAbsorbed, uint256 usdValue)'
const AbsorbDebtEvent = 'event AbsorbDebt(address indexed absorber, address indexed borrower, uint256 basePaidOut, uint256 usdValue)'

// Start dates for backfill (rest of config pulled from fees/compound-v3.ts)
const startDates: Record<string, string> = {
  [CHAIN.ETHEREUM]: '2022-08-14',
  [CHAIN.POLYGON]: '2023-02-19',
  [CHAIN.ARBITRUM]: '2023-05-05',
  [CHAIN.BASE]: '2023-08-05',
  [CHAIN.SCROLL]: '2024-02-17',
  [CHAIN.OPTIMISM]: '2024-04-07',
  [CHAIN.MANTLE]: '2024-10-24',
  [CHAIN.LINEA]: '2025-02-01',
  [CHAIN.UNICHAIN]: '2025-02-19',
}

const fetch = async (options: FetchOptions) => {
  const dailyLiquidations = options.createBalances()
  const dailyLiquidationRepaidDebt = options.createBalances()

  const comets = CometAddresses[options.chain]
  if (!comets) return { dailyLiquidations, dailyLiquidationRepaidDebt }

  // Resolve base token for each comet (needed for AbsorbDebt which uses basePaidOut)
  const baseTokens = await options.api.multiCall({
    abi: 'address:baseToken',
    calls: comets,
    permitFailure: true,
  })

  for (let i = 0; i < comets.length; i++) {
    const comet = comets[i]
    const baseToken = baseTokens[i]

    const absorbCollateralEvents: any[] = await options.getLogs({
      target: comet,
      eventAbi: AbsorbCollateralEvent,
    })
    for (const e of absorbCollateralEvents) {
      dailyLiquidations.add(e.asset, e.collateralAbsorbed)
    }

    if (baseToken) {
      const absorbDebtEvents: any[] = await options.getLogs({
        target: comet,
        eventAbi: AbsorbDebtEvent,
      })
      for (const e of absorbDebtEvents) {
        dailyLiquidationRepaidDebt.add(baseToken, e.basePaidOut)
      }
    }
  }

  return { dailyLiquidations, dailyLiquidationRepaidDebt }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: Object.fromEntries(
    Object.keys(CometAddresses)
      .filter((chain) => startDates[chain])
      .map((chain) => [chain, { fetch, start: startDates[chain] }])
  ) as BaseAdapter,
  methodology: {
    Liquidations: 'Total USD value of collateral absorbed in Compound V3 (Comet) AbsorbCollateral events.',
    LiquidationRepaidDebt: 'Total USD value of debt absorbed by the protocol in Compound V3 (Comet) AbsorbDebt events.',
  },
}

export default adapter