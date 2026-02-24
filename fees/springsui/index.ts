import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

interface FeeStats {
  springSuiFeesUsd: string;
  springSuiStakerRevenue: string;
}

const fetch = async (options: FetchOptions) => {
  const suilendFeesURL = 'https://api.suilend.fi/springsui/stats/fees';
  const url = `${suilendFeesURL}?endTimestamp=${options.endTimestamp}&startTimestamp=${options.startTimestamp}`
  const stats: FeeStats = (await fetchURL(url));
  const stakerRevenue = Number(stats.springSuiStakerRevenue);
  const dailyProtocolRevenue = Number(stats.springSuiFeesUsd);
  const dailyFees = stakerRevenue + dailyProtocolRevenue;

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue: stakerRevenue
  };
};

const methodology = {
  Fees: 'Fees paid by those minting and redeeming SpringSui + staking rewards.',
  Revenue: 'Fees are collected by SpringSui.',
  ProtocolRevenue: 'Fees are collected by SpringSui.',
  SupplySideRevenue: 'The staking rewards earned by sSUI stakers'
}


const adapter: Adapter = {
  methodology,
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: '2024-10-29',
    },
  },
};

export default adapter;