import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

interface FeeStats {
  ecosystemFeesUsd: string;
  ecosystemStakerRevenue: string;
}

const fetch = async (options: FetchOptions) => {
  const suilendFeesURL = 'https://api.suilend.fi/springsui/stats/fees';
  const url = `${suilendFeesURL}?endTimestamp=${options.endTimestamp}&startTimestamp=${options.startTimestamp}`
  const stats: FeeStats = (await fetchURL(url));
  const stakerFees = Number(stats.ecosystemStakerRevenue);
  const dailyProtocolRevenue = Number(stats.ecosystemFeesUsd);
  const dailyFees = stakerFees + dailyProtocolRevenue;

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue: stakerFees
  };
};

const methodology = {
  Fees: 'Fees paid by those minting and redeeming SpringSui Ecosystem LSTs + staking rewards',
  Revenue: 'Fees are collected by SpringSui Ecosystem.',
  ProtocolRevenue: 'Fees are collected by SpringSui Ecosystem.',
  SupplySideRevenue: 'Staking rewards'
}


const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: '2024-10-29',
    },
  },
  methodology,
};

export default adapter;