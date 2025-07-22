import {
  Adapter,
  FetchOptions,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import BigNumber from "bignumber.js";
const suilendFeesURL = 'https://api.suilend.fi/springsui/stats/fees';

interface FeeStats {
  ecosystemFeesUsd: string;
  ecosystemStakerRevenue: string;
}

const methodology = {
  Revenue: 'Net staking rewards earned by those staking Sui for an Ecosystem LST',
  Fees: 'Fees paid by those minting and redeeming SpringSui Ecosystem LSTs + staking rewards',
}

const fetchSpringSuiEcosystemStats = async ({ endTimestamp, startTimestamp }: FetchOptions) => {
  const url = `${suilendFeesURL}?endTimestamp=${endTimestamp}&startTimestamp=${startTimestamp}`
  const stats: FeeStats = (await fetchURL(url));
  const stakerFees = new BigNumber(stats.ecosystemStakerRevenue);
  const protocolRevenue = new BigNumber(stats.ecosystemFeesUsd);
  
  return {
    dailyRevenue: protocolRevenue.toNumber(),
    dailyFees: stakerFees.plus(protocolRevenue).toNumber()
  };
};



const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchSpringSuiEcosystemStats,
      start: '2024-10-29',
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
