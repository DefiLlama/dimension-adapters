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

// Nado (Private Alpha)
// Production API on Ink Mainnet
const archiveInkUrl = "https://archive.prod.nado.xyz/v1";

type TURL = {
  [s: string]: string;
};

const url: TURL = {
  [CHAIN.INK]: archiveInkUrl,
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

  return { dailyFees, dailyRevenue };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.INK],
  start: '2025-11-15',
};

export default adapter;
