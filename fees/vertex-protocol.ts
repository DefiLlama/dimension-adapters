import { CHAIN } from "../helpers/chains";
import { Adapter, FetchOptions, FetchResultFees } from "../adapters/types";
import { httpPost } from "../utils/fetchURL";

interface MarketSnapshots {
  interval: {
    count: number;
    granularity: number;
    max_time: number;
  };
}

interface QueryBody {
  market_snapshots: MarketSnapshots;
}

interface IData {
  [s: string]: string;
}

interface Snapshot {
  [s: string]: IData;
}

interface Response {
  snapshots: Snapshot[];
}

const archiveArbitrumUrl = "https://archive.prod.vertexprotocol.com/v1";
const archiveMantleUrl = "https://archive.mantle-prod.vertexprotocol.com/v1";
const archiveSeiUrl = "https://archive.sei-prod.vertexprotocol.com/v1";
const archiveBaseUrl = "https://archive.base-prod.vertexprotocol.com/v1";
const archiveSonicUrl = "https://archive.sonic-prod.vertexprotocol.com/v1";

type TURL = {
  [s: string]: string;
};

const url: TURL = {
  [CHAIN.ARBITRUM]: archiveArbitrumUrl,
  [CHAIN.MANTLE]: archiveMantleUrl,
  [CHAIN.SEI]: archiveSeiUrl,
  [CHAIN.BASE]: archiveBaseUrl,
  [CHAIN.SONIC]: archiveSonicUrl,
};

const query = async (
  max_time: number,
  fetchOptions: FetchOptions
): Promise<Response> => {
  const body: QueryBody = {
    market_snapshots: {
      interval: {
        count: 2,
        granularity: 86400,
        max_time: max_time,
      },
    },
  };

  const response = await httpPost(url[fetchOptions.chain], body);
  return response;
};

const sumAllProductStats = (stat_map: IData): number => {
  let stat_sum = 0;
  for (const v of Object.values(stat_map)) {
    stat_sum += parseInt(v);
  }
  return stat_sum / 1e18;
};

const get24hrStat = async (
  field: string,
  max_time: number,
  fetchOptions: FetchOptions
): Promise<number> => {
  const response = await query(max_time, fetchOptions);
  const cur_res: Snapshot = response.snapshots[0];
  const past_res: Snapshot = response.snapshots[1];
  return (
    sumAllProductStats(cur_res[field]) - sumAllProductStats(past_res[field])
  );
};

const getCumulativeStat = async (
  field: string,
  max_time: number,
  fetchOptions: FetchOptions
): Promise<number> => {
  const response = await query(max_time, fetchOptions);
  const cur_res = response.snapshots[0];
  return sumAllProductStats(cur_res[field]);
};

const getCumulativeFees = async (
  max_time: number,
  fetchOptions: FetchOptions
): Promise<number> => {
  const fees = await getCumulativeStat(
    "cumulative_taker_fees",
    max_time,
    fetchOptions
  );
  const sequencer_fees = await getCumulativeStat(
    "cumulative_sequencer_fees",
    max_time,
    fetchOptions
  );
  return fees - sequencer_fees;
};

const getCumulativeRevenue = async (
  max_time: number,
  fetchOptions: FetchOptions
): Promise<number> => {
  const fees = await getCumulativeFees(max_time, fetchOptions);
  const rebates = await getCumulativeStat(
    "cumulative_maker_fees",
    max_time,
    fetchOptions
  );
  return fees + rebates;
};

const get24hrFees = async (
  max_time: number,
  fetchOptions: FetchOptions
): Promise<number> => {
  const fees = await get24hrStat(
    "cumulative_taker_fees",
    max_time,
    fetchOptions
  );
  const sequencer_fees = await get24hrStat(
    "cumulative_sequencer_fees",
    max_time,
    fetchOptions
  );
  return fees - sequencer_fees;
};

const get24hrRevenue = async (
  max_time: number,
  fetchOptions: FetchOptions
): Promise<number> => {
  const fees = await get24hrFees(max_time, fetchOptions);
  const rebates = await get24hrStat(
    "cumulative_maker_fees",
    max_time,
    fetchOptions
  );
  return fees + rebates;
};

const fetch = async (
  timestamp: number,
  _: any,
  fetchOptions: FetchOptions
): Promise<FetchResultFees> => {
  const dailyFees = await get24hrFees(timestamp, fetchOptions);
  const dailyRevenue = await get24hrRevenue(timestamp, fetchOptions);
  const totalFees = await getCumulativeFees(timestamp, fetchOptions);
  const totalRev = await getCumulativeRevenue(timestamp, fetchOptions);
  return {
    dailyFees: `${dailyFees}`,
    dailyRevenue: `${dailyRevenue}`,
    totalRevenue: `${totalRev}`,
    totalFees: `${totalFees}`,
    timestamp,
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: "2023-04-26",
    },
    [CHAIN.MANTLE]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: "2023-04-26",
    },
    [CHAIN.SEI]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: "2024-08-13",
    },
    [CHAIN.BASE]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: "2024-09-04",
    },
    [CHAIN.SONIC]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: "2024-12-18",
    },
  },
};

export default adapter;
