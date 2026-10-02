import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchCroTrade, LABELS } from "../aggregators/cro-trade";

// Fee events and receivers are documented in aggregators/cro-trade/index.ts.
const fetch = async (options: FetchOptions) => {
  const { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue } = await fetchCroTrade(options)
  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  }
}

const methodology = {
  Fees: 'The 0.9% fee cro.trade charges on every spot trade routed through its contracts on Cronos.',
  UserFees: 'The 0.9% fee cro.trade charges on every spot trade routed through its contracts on Cronos.',
  Revenue: 'All trading fees are kept by cro.trade (no share goes to liquidity providers). Spot referral payouts are made off-chain from another venue and are not deducted.',
  ProtocolRevenue: 'Trading fees paid to the cro.trade treasury wallet: all fees until 2026-09-22, none after.',
  HoldersRevenue: 'Trading fees paid to the CronusBurner contract, which buys CRONUS on the market and burns it: all fees since 2026-09-22, none before.',
}

const breakdownMethodology = {
  Fees: {
    [LABELS.Fees]: 'The 0.9% fee on each spot trade routed by cro.trade, taken in CRO or in the input token.',
  },
  UserFees: {
    [LABELS.Fees]: 'The 0.9% fee on each spot trade routed by cro.trade, taken in CRO or in the input token.',
  },
  Revenue: {
    [LABELS.ToTreasury]: 'Trading fees sent to the cro.trade treasury wallet (until 2026-09-22).',
    [LABELS.ToBuyback]: 'Trading fees sent to the CronusBurner contract to buy back and burn CRONUS (since 2026-09-22).',
  },
  ProtocolRevenue: {
    [LABELS.ToTreasury]: 'Trading fees sent to the cro.trade treasury wallet (until 2026-09-22).',
  },
  HoldersRevenue: {
    [LABELS.Buyback]: 'Trading fees sent to the CronusBurner contract, which buys CRONUS and burns it (since 2026-09-22).',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.CRONOS],
  start: '2026-03-04',
  methodology,
  breakdownMethodology,
}

export default adapter
