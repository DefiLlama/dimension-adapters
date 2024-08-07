import { Chain } from "@defillama/sdk/build/general";
import { Adapter, FetchOptions, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";


interface IFee {
  time: string;
  v2_fees: number;
  total_fees: number;
}

const fetch = (chain: Chain) => {
  return async (timestamp: number, _t: any, options: FetchOptions): Promise<FetchResultFees> => {
    const fees: IFee[] = (await queryDune(chain === CHAIN.ARBITRUM ? "3971843" : "3971936"))
    // const queryId = chain === CHAIN.ARBITRUM ? "3186689" : "3186714";
    // const fees: IFee[] = (await fetchURLWithRetry(`https://api.dune.com/api/v1/query/${queryId}/results`)).result.rows;
    // const fees: IFee[] = require(`./${chain}.json`);
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(options.endTimestamp * 1000));
    const dateString = new Date(dayTimestamp * 1000).toISOString().split("T")[0];
    const daily = fees.find(fee => fee.time.split(' ')[0] === dateString);
    const dailyFees = daily?.v2_fees || 0
    const total_fees = daily?.total_fees || 0;
    return {
      dailyFees: `${dailyFees}`,
      dailyRevenue: `${dailyFees * 0.37}`,
      dailyProtocolRevenue: `${dailyFees * 0.1}`,
      dailyHoldersRevenue: `${dailyFees * 0.27}`,
      totalFees: `${total_fees}`,
      timestamp,
    };
  };
};

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: 1690848000,
    },
    [CHAIN.AVAX]: {
      fetch: fetch(CHAIN.AVAX),
      start: 1692835200,
    },
  },
  isExpensiveAdapter: true,
};
export default adapter;
