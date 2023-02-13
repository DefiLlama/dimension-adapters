import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfPreviousDayUTC } from "../utils/date";
import axios from "axios";

const endpoint = "https://api-be.firebird.finance/v1/hyper/fees/info";

interface FeeInfoResponse {
  data: {
    dailyFees: number;
    totalFees: number;
  };
}

const fetch = (chainId: number) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const dayTimestamp = getTimestampAtStartOfPreviousDayUTC(timestamp);
    const response = await axios.get<FeeInfoResponse>(
      `${endpoint}?chain_id=${chainId}&day=${dayTimestamp}`
    );
    const dailyFees = response.data.data.dailyFees.toString();
    const totalFees = response.data.data.totalFees.toString();
    return {
      timestamp: dayTimestamp,
      dailyFees,
      totalFees,
      dailyRevenue: dailyFees,
      totalRevenue: totalFees,
    } as FetchResultFees;
  };
};

const methodology = {
  Fees: "Fees collected from user trading fees",
  Revenue: "Revenue is 100% fee of each swap which goes to treasury",
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetch(43114),
      start: async () => 1659935138,
      meta: { methodology },
    },
    [CHAIN.FANTOM]: {
      fetch: fetch(137),
      start: async () => 1654574276,
      meta: { methodology },
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(137),
      start: async () => 1661412914,
      meta: { methodology },
    },
    [CHAIN.BSC]: {
      fetch: fetch(56),
      start: async () => 1657270551,
      meta: { methodology },
    },
    [CHAIN.CRONOS]: {
      fetch: fetch(25),
      start: async () => 1656399464,
      meta: { methodology },
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetch(1),
      start: async () => 1673321423,
      meta: { methodology },
    },
  },
};

export default adapter;
