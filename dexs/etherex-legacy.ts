import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchStats } from "./etherex";

const fetch = async (options: FetchOptions) => {
  const stats = await fetchStats(options);

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailyBribesRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  dailyFees.addUSDValue(stats.legacyFeesUSD, 'Token Swap Fees')
  dailyFees.addUSDValue(stats.legacyBribeRevenueUSD, 'Bribes Rewards')

  dailyRevenue.addUSDValue(stats.legacyUserFeesRevenueUSD, 'Token Swap Fees To Holders')
  dailyHoldersRevenue.addUSDValue(stats.legacyUserFeesRevenueUSD, 'Token Swap Fees To Holders')
  dailyRevenue.addUSDValue(stats.legacyBribeRevenueUSD, 'Bribes Revenue')
  dailyHoldersRevenue.addUSDValue(stats.legacyBribeRevenueUSD, 'Bribes Revenue')

  dailyRevenue.addUSDValue(stats.legacyProtocolRevenueUSD, 'Token Swap Fees To Protocol')
  dailyProtocolRevenue.addUSDValue(stats.legacyProtocolRevenueUSD, 'Token Swap Fees To Protocol')

  dailySupplySideRevenue.addUSDValue(stats.legacyFeesUSD - stats.legacyUserFeesRevenueUSD - stats.legacyProtocolRevenueUSD, 'Token Swap Fees To LPs')

  return {
    dailyVolume: stats.legacyVolumeUSD,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
    dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Fees are collected from users on each swap + bribes rewards.",
  Revenue: "Revenue going to the protocol + Token holder Revenue.",
  UserFees: "User pays fees on each swap.",
  ProtocolRevenue: "Revenue going to the protocol.",
  HoldersRevenue: "User fees are distributed among holders.",
  SupplySideRevenue: "Fees distributed to LPs.",
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.LINEA],
  start: '2025-07-26',
  methodology,
  breakdownMethodology: {
    Fees: {
      'Token Swap Fees': 'Fees are collected from users on each swap',
      'Bribes Rewards': 'All bribes rewards are collected and distributed to holders.',
    },
    Revenue: {
      'Token Swap Fees To Holders': 'Share of swap fees to holders.',
      'Token Swap Fees To Protocol': 'Share of swap fees to protocol.',
      'Bribes Revenue': 'All bribes rewards are collected and distributed to holders.',
    },
    HoldersRevenue: {
      'Token Swap Fees To Holders': 'Share of swap fees to holders.',
      'Bribes Revenue': 'All bribes rewards are collected and distributed to holders.',
    },
    SupplySideRevenue: {
      'Token Swap Fees To LPs': 'Share of swap fees to LPs.',
    },
  }
};

export default adapter;
