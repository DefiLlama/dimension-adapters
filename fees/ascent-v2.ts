import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";
import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { getBlock } from "../helpers/getBlock";

const STABLE_FEES = 0.0001;
const VOLATILE_FEES = 0.002;
const endpoint = "https://eon-graph.horizenlabs.io/subgraphs/name/Ascent/ascent-subgraph";

interface IPair {
  id: string;
  volumeUSD: string;
  isStable: boolean;
}

interface IGraphResponse {
  today: IPair[];
  yesterday: IPair[];
}
const getFees = () => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
    const fromTimestamp = todaysTimestamp - 60 * 60 * 24
    const toTimestamp = todaysTimestamp
    const todaysBlock = await getBlock(toTimestamp, CHAIN.EON, {});
    const yesterdaysBlock = await getBlock(fromTimestamp, CHAIN.EON, {});

    const query = gql`
      query fees {
        yesterday: pairs(block: {number: ${yesterdaysBlock}}, where: {volumeUSD_gt: "0"}, first: 1000) {
          id
          isStable
          volumeUSD
        }
        today: pairs(block: {number: ${todaysBlock}}, where: {volumeUSD_gt: "0"}, first: 1000) {
          id
          isStable
          volumeUSD
        }
      }
    `;

    const graphRes: IGraphResponse = await request(endpoint, query);
    const totalFeesToday = graphRes.today.reduce((acc, pool) => {
      if (pool.isStable) {
        return acc.plus(new BigNumber(pool.volumeUSD).times(STABLE_FEES));
      } else {
        return acc.plus(new BigNumber(pool.volumeUSD).times(VOLATILE_FEES));
      }
    }, new BigNumber(0));

    const totalFeesYesterday = graphRes.yesterday.reduce((acc, pool) => {
      if (pool.isStable) {
        return acc.plus(new BigNumber(pool.volumeUSD).times(STABLE_FEES));
      } else {
        return acc.plus(new BigNumber(pool.volumeUSD).times(VOLATILE_FEES));
      }
    }, new BigNumber(0));
    const dailyFee = totalFeesToday.minus(totalFeesYesterday);

    return {
      timestamp,
      dailyFees: dailyFee.toString(),
      dailyUserFees: dailyFee.toString(),
      dailyRevenue: dailyFee.multipliedBy(0.32).toString(),
    };
  };
};


  const adapter: SimpleAdapter = {
      adapter: {
          [CHAIN.EON]: {
              fetch: getFees(),
              start: 1698796800,

          meta: {
            methodology: {
              UserFees: "User pays 0.05%, 0.30%, or 1% on each swap."
            }
          }
      }
      }
  }




              export default adapter;
