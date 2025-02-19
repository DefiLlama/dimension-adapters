import { Chain } from "@defillama/sdk/build/general";
import { Adapter, FetchOptions, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import request, { gql } from "graphql-request";


interface IFee {
  time: string;
  v2_fees: number;
  total_fees: number;
}

const fetchSolana = async (_tt: number, _t: any, options: FetchOptions) => {
  const query = gql`
    {
      feesRecords(limit: 10000000, where: {timestamp_gte: "${new Date(options.startTimestamp * 1000).toISOString()}", timestamp_lte: "${new Date(options.endTimestamp * 1000).toISOString()}"}) {
        fees
        timestamp
      }
    }
  `
  const url = "https://gmx-solana-sqd.squids.live/gmx-solana-base:prod/api/graphql"
  const res = await request(url , query)
  const dailyFees = res.feesRecords
    .reduce((acc: number, record: { fees: string }) => acc + Number(record.fees), 0)
  return {
    timestamp: options.startOfDay,
    dailyFees: dailyFees / (10 ** 20),
  }
}

const fetch = (chain: Chain) => {
  return async (timestamp: number, _t: any, _: FetchOptions): Promise<FetchResultFees> => {
    const fees: IFee[] = (await queryDune(chain === CHAIN.ARBITRUM ? "4385920" : "4385999"))
    // const queryId = chain === CHAIN.ARBITRUM ? "3186689" : "3186714";
    // const fees: IFee[] = (await fetchURLWithRetry(`https://api.dune.com/api/v1/query/${queryId}/results`)).result.rows;
    // const fees: IFee[] = require(`./${chain}.json`);
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
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
      start: '2023-08-01',
    },
    [CHAIN.AVAX]: {
      fetch: fetch(CHAIN.AVAX),
      start: '2023-08-24',
    },
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: '2023-07-25',
    },
  },
  isExpensiveAdapter: true,
};
export default adapter;
