import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { METRIC } from '../../helpers/metrics'
import { fetchPerpsMetrics, perpsWindowMs } from '../../helpers/popdex'

const BUILDER_FEES = 'Builder Fees'
const BUILDER_TO_BUILDERS = 'Builder Fees To Builders'
const MAKER_REBATES = 'Maker Rebates'
const REFERRAL_REBATES = 'Referral Rebates'
const MEGAPOP = 'MegaPop Prize Pool Contributions'
const NET_REVENUE = 'Net Trading Fee Revenue'

const fetch = async (options: FetchOptions) => {
  const { startTime, endTime } = perpsWindowMs(options)
  const m = await fetchPerpsMetrics(startTime, endTime)

  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyRevenue = options.createBalances()

  dailyVolume.addUSDValue(m.volume)
  dailyFees.addUSDValue(m.tradingFee, METRIC.TRADING_FEES)
  dailyFees.addUSDValue(m.builderFee, BUILDER_FEES)
  dailySupplySideRevenue.addUSDValue(m.builderFee, BUILDER_TO_BUILDERS)
  dailySupplySideRevenue.addUSDValue(m.makerRebate, MAKER_REBATES)
  dailySupplySideRevenue.addUSDValue(m.referralRebate, REFERRAL_REBATES)
  dailySupplySideRevenue.addUSDValue(m.traderRewards, MEGAPOP)
  dailyRevenue.addUSDValue(m.revenue, NET_REVENUE)

  return {
    dailyVolume,
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyHoldersRevenue: 0,
  }
}

const methodology = {
  Volume: 'Notional of perpetual taker fills, counted once, excluding spot.',
  Fees: 'Positive perpetual trading fees plus builder surcharges paid by users. Excludes funding payments and spot.',
  SupplySideRevenue: 'Maker rebates, referral rebates, the full builder surcharge, and MegaPop prize-pool contributions. Each is a share of trading fees accrued on its own rule, and is not capped by the fees collected in the same window.',
  Revenue: 'Fees minus supply-side revenue. Because rebates and the MegaPop contribution accrue on their own rules, this is negative when they exceed fees collected in the window.',
  HoldersRevenue: 'PopDEX does not buy back, burn, or distribute fees to token holders, so this is zero.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: 'Positive perpetual trading fees paid by users.',
    [BUILDER_FEES]: 'Builder surcharges paid by users on top of trading fees. The full amount is passed to the builder.',
  },
  SupplySideRevenue: {
    [BUILDER_TO_BUILDERS]: 'Builder surcharges passed in full to the builder that routed the order.',
    [MAKER_REBATES]: 'Rebates paid to makers from the trading-fee split.',
    [REFERRAL_REBATES]: 'Rebates paid to referrers from the trading-fee split.',
    [MEGAPOP]: 'MegaPop prize-pool contributions taken from the trading-fee split and accrued by the MegaPop rules.',
  },
  Revenue: {
    [NET_REVENUE]: 'Trading fees left after rebates, builder surcharges, and the MegaPop contribution. Negative when those exceed fees collected in the window.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.MORPH_TACHYON],
  start: '2026-09-25',
  // Rebates and the MegaPop contribution accrue on their own rules and can
  // exceed trading fees collected in the same window, so revenue is negative.
  allowNegativeValue: true,
  methodology,
  breakdownMethodology,
}

export default adapter
