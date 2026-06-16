import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchStats } from "./pharaoh-v3";

const fetch = async (options: FetchOptions) => {
  const stats = await fetchStats(options);

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()

  dailyFees.addUSDValue(stats.legacyFeesUSD, 'Token Swap Fees')
  dailyFees.addUSDValue(stats.legacyBribeRevenueUSD, 'Bribes Rewards')

  dailyRevenue.addUSDValue(stats.legacyUserFeesRevenueUSD, 'Token Swap Fees To Holders')
  dailyRevenue.addUSDValue(stats.legacyProtocolRevenueUSD, 'Token Swap Fees To Protocol')
  dailyRevenue.addUSDValue(stats.legacyBribeRevenueUSD, 'Bribes Revenue')

  dailyHoldersRevenue.addUSDValue(stats.legacyUserFeesRevenueUSD, 'Token Swap Fees To Holders')
  dailyHoldersRevenue.addUSDValue(stats.legacyBribeRevenueUSD, 'Bribes Revenue')

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
  Fees: "Fees are collected from users on each swap + bribes revenue.",
  Revenue: "Revenue going to the protocol + Token holder Revenue.",
  UserFees: "User pays fees on each swap.",
  ProtocolRevenue: "Revenue going to the protocol.",
  HoldersRevenue: "User fees are distributed among holders.",
  SupplySideRevenue: "Fees distributed to LPs.",
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.AVAX],
  start: '2025-10-08',
  methodology,
  breakdownMethodology: {
    Fees: {
      'Token Swap Fees': 'Swap fees paid by users on Pharaoh legacy pools.',
      'Bribes Rewards': 'Vote bribes deposited for Pharaoh legacy pools.',
    },
    UserFees: {
      'Token Swap Fees': 'Swap fees paid by users on Pharaoh legacy pools.',
      'Bribes Rewards': 'Vote bribes deposited for Pharaoh legacy pools.',
    },
    Revenue: {
      'Token Swap Fees To Holders': 'Portion of legacy swap fees distributed to xPHAR holders.',
      'Token Swap Fees To Protocol': 'Treasury portion of legacy swap fees.',
      'Bribes Revenue': 'Vote bribes distributed to xPHAR holders.',
    },
    ProtocolRevenue: {
      'Token Swap Fees To Protocol': 'Treasury portion of legacy swap fees.',
    },
    HoldersRevenue: {
      'Token Swap Fees To Holders': 'Portion of legacy swap fees distributed to xPHAR holders.',
      'Bribes Revenue': 'Vote bribes distributed to xPHAR holders.',
    },
    SupplySideRevenue: {
      'Token Swap Fees To LPs': 'Legacy swap fees retained by LPs after holder and treasury fee shares.',
    },
  }
};

export default adapter;
