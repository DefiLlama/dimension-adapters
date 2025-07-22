import {
  Adapter,
  FetchOptions,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import BigNumber from "bignumber.js";
const suilendFeesURL = 'https://api.suilend.fi/springsui/stats/fees';

interface FeeStats {
  springSuiFeesUsd: string;
  springSuiStakerRevenue: string;
}

const methodology = {
  Revenue: 'Net staking rewards earned by those staking Sui for SpringSui',
  Fees: 'Fees paid by those minting and redeeming SpringSui + staking rewards',
}

const fetchSpringSuiStats = async ({ endTimestamp, startTimestamp }: FetchOptions) => {
  const url = `${suilendFeesURL}?endTimestamp=${endTimestamp}&startTimestamp=${startTimestamp}`
  const stats: FeeStats = (await fetchURL(url));
  const stakerRevenue = new BigNumber(stats.springSuiStakerRevenue);
  const protocolRevenue = new BigNumber(stats.springSuiFeesUsd);
  
  return {
    dailyRevenue: protocolRevenue.toNumber(),
    dailyFees: stakerRevenue.plus(protocolRevenue).toNumber()
  };
};



const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchSpringSuiStats,
      start: '2024-10-29',
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
