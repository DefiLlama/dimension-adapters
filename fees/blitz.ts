import { CHAIN } from "../helpers/chains";
import { Adapter, FetchResultFees } from "../adapters/types";
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

const query = async (max_time: number): Promise<Response> => {
  const body: QueryBody = {
    market_snapshots: {
      interval: {
        count: 2,
        granularity: 86400,
        max_time: max_time,
      },
    },
  };

  const archiveBaseUrl = "https://archive.blast-prod.vertexprotocol.com/v1";
  const response = await httpPost(archiveBaseUrl, body);
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
  max_time: number
): Promise<number> => {
  const response = await query(max_time);
  const cur_res: Snapshot = response.snapshots[0];
  const past_res: Snapshot = response.snapshots[1];
  return (
    sumAllProductStats(cur_res[field]) - sumAllProductStats(past_res[field])
  );
};

const get24hrFees = async (max_time: number): Promise<number> => {
  const fees = await get24hrStat("cumulative_taker_fees", max_time);
  const sequencer_fees = await get24hrStat(
    "cumulative_sequencer_fees",
    max_time
  );
  return fees - sequencer_fees;
};

const get24hrRevenue = async (max_time: number): Promise<number> => {
  const fees = await get24hrFees(max_time);
  const rebates = await get24hrStat("cumulative_maker_fees", max_time);
  return fees + rebates;
};

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const dailyFees = await get24hrFees(timestamp);
  const dailyRevenue = await get24hrRevenue(timestamp);

  return {
    dailyFees,
    dailyRevenue,
  };
};

const adapter: Adapter = {
  version: 1,
  deadFrom: '2025-07-18', // https://docs.vertexprotocol.com
  adapter: {
    [CHAIN.BLAST]: {
      fetch,
      runAtCurrTime: true,
      start: '2024-03-12',
    },
  },
  allowNegativeValue: true, // when maker rebates exceed taker fees minus sequencer fees
};

export default adapter;
