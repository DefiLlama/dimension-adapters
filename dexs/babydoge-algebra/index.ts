import { CHAIN } from "../../helpers/chains";
import request, { gql } from "graphql-request";
import {
  FetchOptions,
  SimpleAdapter,
  FetchResultVolume,
  FetchResultFees,
} from "../../adapters/types";
import BigNumber from "bignumber.js";

export const BABYDOGE_GRAPHQL_ENDPOINT =
  "https://gateway.thegraph.com/api/9ce7bb24f9764358478f6a82c68e7ad3/subgraphs/id/9a8QustfXaMcrBcdB3rZidfLHjGa2eW1AVbUzHUQD3qb";

type Feed = "volumeUSD" | "feesUSD";

/**
 * Fetch daily volume/fees in USD by summing poolDayDatas for the target date.
 */
export const fetchBabydogeV4Data = async (
  timestamp: number,
  _ctx: any,
  options: FetchOptions,
  feedKey: Feed,
): Promise<FetchResultVolume | FetchResultFees> => {
  const dayTs = options.startOfDay ?? timestamp;

  const q = gql`
    query Day($date: Int!) {
      poolDayDatas(first: 1000, where: { date: $date }) {
        ${feedKey}
      }
    }
  `;

  const res = await request(BABYDOGE_GRAPHQL_ENDPOINT, q, { date: dayTs });

  // Sum all values for the day; default to 0 if field is missing/null.
  const dailyUSD = (res.poolDayDatas || [])
    .reduce((acc: string, d: any) => new BigNumber(acc).plus(d?.[feedKey] || 0).toString(), "0");

  return feedKey === "volumeUSD"
    ? { timestamp: dayTs, dailyVolume: dailyUSD }
    : { timestamp: dayTs, dailyFees: dailyUSD };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BSC]: {
      fetch: (t, _, o) => fetchBabydogeV4Data(t, _, o, "volumeUSD"),
      start: 1752537600,
    },
  },
};

export default adapter;
