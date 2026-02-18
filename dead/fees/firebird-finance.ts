import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfPreviousDayUTC } from "../utils/date";
import { httpGet } from "../utils/fetchURL";

const endpoint = "https://api-be.firebird.finance/v1/hyper/fees/info";

interface FeeInfoResponse {
  data: {
    dailyFees: number;
  };
}

const fetch = (chainId: number) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const dayTimestamp = getTimestampAtStartOfPreviousDayUTC(timestamp);
    const response: FeeInfoResponse = await httpGet(      `${endpoint}?chain_id=${chainId}&day=${dayTimestamp}`    );
    const dailyFees = response.data.dailyFees.toString();

    return {
      dailyFees,
      dailyRevenue: dailyFees,
    } as FetchResultFees;
  };
};

const methodology = {
  Fees: "Fees collected from user trading fees",
  Revenue: "Revenue is 100% fee of each swap which goes to treasury",
};

const adapter: Adapter = {
  methodology,
  deadFrom: '2024-02-29',
  version: 1,
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetch(43114),
      start: '2022-08-08',
    },
    [CHAIN.FANTOM]: {
      fetch: fetch(137),
      start: '2022-06-07',
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(137),
      start: '2022-08-25',
    },
    [CHAIN.BSC]: {
      fetch: fetch(56),
      start: '2022-07-08',
    },
    [CHAIN.CRONOS]: {
      fetch: fetch(25),
      start: '2022-06-28',
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetch(1),
      start: '2023-01-10',
    },
  },
};

export default adapter;
