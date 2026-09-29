import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { METRIC } from '../helpers/metrics';
import { getUniV3LogAdapter, UniGetRevenueRatioProps } from '../helpers/uniswap';

// goo exchange (https://goo.exchange/docs/): stock uniV3 pools, CREATE2'd by a separate pool deployer; PoolCreated is emitted by the factory.
// Every pool has had slot0().feeProtocol = 68 since launch (1/4 of the swap fee on both sides). The owner can retune it per pool
// (0 or 1/4-1/10), so it is read from each pool. The protocol fee is split 50/50: half to a fee jar that auctions it for GOO and
// burns the GOO, half to a development fund.
const getRevenueRatio = ({ protocolFeeRatioToken0, protocolFeeRatioToken1 }: UniGetRevenueRatioProps) => {
  // Both sides are set in one call and have always been equal. The helper applies one ratio to every swap in a pool
  // and doesn't expose swap direction, so a failed read (undefined) or unequal sides fail rather than guess.
  if (protocolFeeRatioToken0 === undefined || protocolFeeRatioToken0 !== protocolFeeRatioToken1)
    throw new Error('goo-exchange: missing or asymmetric protocol fee ratio')
  return { _revenueRatio: protocolFeeRatioToken0, _protocolRevenueRatio: protocolFeeRatioToken0 / 2, _holdersRevenueRatio: protocolFeeRatioToken0 / 2 }
}

const GOO_BURN_LABEL = 'Swap Fees To GOO Buyback And Burn'
const GOO_DEV_FUND_LABEL = 'Swap Fees To Development Fund'
const GOO_LP_LABEL = 'Swap Fees To LPs'

const methodology = {
  Volume: "Total swap volume on goo exchange pools.",
  Fees: "Swap fees paid by users at each pool's fee tier.",
  UserFees: "Swap fees paid by users at each pool's fee tier.",
  Revenue: "The protocol fee: each pool's share of the swap fee, read from the pool (1/4 on every pool since launch).",
  ProtocolRevenue: "Half of the protocol fee, paid to the development fund.",
  HoldersRevenue: "Half of the protocol fee, sent to a fee jar that auctions it for GOO and burns the GOO.",
  SupplySideRevenue: "Swap fees less the protocol fee, earned by liquidity providers.",
}

const breakdownMethodology = {
  Fees: { [METRIC.SWAP_FEES]: methodology.Fees },
  UserFees: { [METRIC.SWAP_FEES]: methodology.UserFees },
  Revenue: {
    [GOO_BURN_LABEL]: 'Half of the protocol fee, sent to a fee jar that auctions it for GOO and burns the GOO.',
    [GOO_DEV_FUND_LABEL]: 'Half of the protocol fee, paid to the development fund.',
  },
  ProtocolRevenue: { [GOO_DEV_FUND_LABEL]: methodology.ProtocolRevenue },
  HoldersRevenue: { [GOO_BURN_LABEL]: methodology.HoldersRevenue },
  SupplySideRevenue: { [GOO_LP_LABEL]: methodology.SupplySideRevenue },
}

const gooExchangeFetch = getUniV3LogAdapter({
  factory: '0x221A6239E40709792b0d4bdc140fA36158CD41C7',
  userFeesRatio: 1,
  dynamicProtocolFees: true,
  getRevenueRatio,
})

const fetch = async (options: FetchOptions) => {
  const result = await gooExchangeFetch(options)
  const relabel = (balances: any, label: string) => {
    const relabelled = options.createBalances()
    if (balances && typeof balances === 'object') relabelled.add(balances, { label })
    return relabelled
  }
  const dailyFees = relabel(result.dailyFees, METRIC.SWAP_FEES)
  const dailyHoldersRevenue = relabel(result.dailyHoldersRevenue, GOO_BURN_LABEL)
  const dailyProtocolRevenue = relabel(result.dailyProtocolRevenue, GOO_DEV_FUND_LABEL)
  const dailyRevenue = options.createBalances()
  dailyRevenue.addBalances(dailyHoldersRevenue)
  dailyRevenue.addBalances(dailyProtocolRevenue)
  return {
    dailyVolume: result.dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(1),
    dailySupplySideRevenue: relabel(result.dailySupplySideRevenue, GOO_LP_LABEL),
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ROBINHOOD]: {
      fetch,
      start: '2026-09-26',
    },
  },
  methodology,
  breakdownMethodology,
}

export default adapter;
