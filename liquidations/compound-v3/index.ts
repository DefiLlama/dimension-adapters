import { CHAIN } from '../../helpers/chains'
import { BaseAdapter, FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CometAddresses } from '../../fees/compound-v3'

const AbsorbCollateralEvent = 'event AbsorbCollateral(address indexed absorber, address indexed borrower, address indexed asset, uint256 collateralAbsorbed, uint256 usdValue)'

// Comets whose oracle prices are quoted in the base asset, not USD: getPrice(baseTokenPriceFeed()) is 1e8 from a
// "Constant price feed" (WETH and wstETH markets) or a "WBTC / BTC" feed (WBTC market), and every collateral feed is in the
// same unit, so AbsorbCollateral.usdValue is in ETH / wstETH / BTC. A Comet has no on-chain field for its price unit, and
// getPrice(baseTokenPriceFeed()) also reads ~1e8 on the USD stablecoin markets, so they are listed here.
const baseDenominatedComets = new Set([
  '0xa17581a9e3356d9a858b789d68b4d866e593ae94', // ethereum cWETHv3
  '0x3d0bb1ccab520a66e607822fc55bc921738fafe3', // ethereum cwstETHv3
  '0xe85dc543813b8c2cfeaac371517b925a166a9293', // ethereum cWBTCv3
  '0x6f7d514bbd4aff3bcd1140b7344b32f063dee486', // arbitrum cWETHv3
  '0x46e6b214b524310239732d51387075e0e70970bf', // base cWETHv3
  '0xe36a30d249f7761327fd973001a32010b521b6fd', // optimism cWETHv3
])

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
    if (!absorbCollateralEvents.length) continue

    if (baseDenominatedComets.has(comet.toLowerCase())) {
      // usdValue is in the Comet's price unit: base amount = usdValue * baseScale / getPrice(baseTokenPriceFeed)
      const [baseToken, baseScale, basePriceFeed] = await Promise.all([
        options.api.call({ target: comet, abi: 'address:baseToken' }),
        options.api.call({ target: comet, abi: 'uint64:baseScale' }),
        options.api.call({ target: comet, abi: 'address:baseTokenPriceFeed' }),
      ])
      const basePrice = await options.api.call({ target: comet, abi: 'function getPrice(address) view returns (uint256)', params: [basePriceFeed] })
      for (const e of absorbCollateralEvents) {
        dailyCollateralLiquidated.add(baseToken, BigInt(e.usdValue) * BigInt(baseScale) / BigInt(basePrice))
      }
      continue
    }

    for (const e of absorbCollateralEvents) {
      dailyCollateralLiquidated.addUSDValue(Number(e.usdValue) / 1e8)
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
    CollateralLiquidated: 'Total USD value of collateral absorbed in Compound V3 (Comet) AbsorbCollateral events. On the WETH, wstETH and WBTC markets the event value is in the base asset and is priced as the base token.',
  },
}

export default adapter