import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpPost } from "../../utils/fetchURL";

const SUBGRAPH = "https://api.haven1.0xgraph.xyz/api/public/bc373e5f-de53-4599-8572-61e112a16f4a/subgraphs/uniswap-v3/main-v0.0.4/";

interface PoolDayData {
  feesUSD: string;
  date: string;
}

interface GraphQLResponse {
  poolDayDatas: PoolDayData[];
}

async function gql(query: string, variables?: any): Promise<GraphQLResponse> {
  const response = await httpPost(SUBGRAPH, {
    query,
    variables,
  });
  
  if (response.errors) {
    throw new Error(JSON.stringify(response.errors));
  }
  
  return response.data;
}

function dayStart(ts: number): number {
  return Math.floor(ts / 86400) * 86400;
}

const fetch = async (options: FetchOptions) => {
  const date = dayStart(options.endTimestamp);
  const data = await gql(
    `query($d:Int!){ poolDayDatas(where: { date: $d }, first: 1000){ feesUSD } }`,
    { d: date }
  );
  
  const fees = (data.poolDayDatas || [])
    .map((d) => Number(d.feesUSD))
    .filter(Number.isFinite);
  const sum = fees.reduce((a, b) => a + b, 0);
  
  return {
    dailyFees: sum.toString(),
    dailyRevenue: "0", // Protocol takes no direct revenue
    dailySupplySideRevenue: sum.toString(), // All fees go to LPs
  };
};

const getStartTimestamp = async (): Promise<number> => {
  const d = await gql(`query{ poolDayDatas(orderBy: date, orderDirection: asc, first: 1){ date } }`);
  return Number(d.poolDayDatas?.[0]?.date || 0);
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.HAVEN1]: {
      fetch,
      start: getStartTimestamp,
      meta: {
        methodology: {
          Fees: "Trading fees paid by users on Haven1 HSwap (Uniswap V3 fork)",
          Revenue: "Protocol takes no direct revenue from trading fees",
          SupplySideRevenue: "All trading fees are distributed to liquidity providers"
        }
      }
    },
  },
};

export default adapter;
