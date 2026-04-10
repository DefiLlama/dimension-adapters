import { CHAIN } from '../../helpers/chains'
import { BaseAdapter, FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CometAddresses } from '../../fees/compound-v3'

const AbsorbCollateralEvent = 'event AbsorbCollateral(address indexed absorber, address indexed borrower, address indexed asset, uint256 collateralAbsorbed, uint256 usdValue)'

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
  const dailyCollateralLiquidated = options.createBalances()

  const comets = CometAddresses[options.chain]
  if (!comets) return { dailyCollateralLiquidated }

  for (let i = 0; i < comets.length; i++) {
    const comet = comets[i]

    const absorbCollateralEvents: any[] = await options.getLogs({
      target: comet,
      eventAbi: AbsorbCollateralEvent,
    })
    for (const e of absorbCollateralEvents) {
      dailyCollateralLiquidated.add(e.asset, e.collateralAbsorbed)
    }
  }

  return { dailyCollateralLiquidated }
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
    CollateralLiquidated: 'Total USD value of collateral absorbed in Compound V3 (Comet) AbsorbCollateral events.',
  },
}

export default adapter