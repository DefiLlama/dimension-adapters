import { Chain } from "@defillama/sdk/build/general";
import { Adapter, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";


interface IFee {
  time: string;
  v2_fees: number;
  total_fees: number;
}

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const fees: IFee[] = (await queryDune(chain === CHAIN.ARBITRUM ? "3464532" : "3464559"))
    // const queryId = chain === CHAIN.ARBITRUM ? "3186689" : "3186714";
    // const fees: IFee[] = (await fetchURLWithRetry(`https://api.dune.com/api/v1/query/${queryId}/results`)).result.rows;
    // const fees: IFee[] = require(`./${chain}.json`);
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
    const dateString = new Date(dayTimestamp * 1000).toISOString().split("T")[0];
    const daily = fees.find(fee => fee.time.split(' ')[0] === dateString);
    const dailyFees = daily?.v2_fees || 0
    const total_fees = daily?.total_fees;
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
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: 1690848000,
      runAtCurrTime: true,
    },
    [CHAIN.AVAX]: {
      fetch: fetch(CHAIN.AVAX),
      start: 1692835200,
      runAtCurrTime: true,
    },
  },
  isExpensiveAdapter: true,
};
export default adapter;
