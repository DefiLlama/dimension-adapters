import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { httpPost } from "../../utils/fetchURL"

const SUBGRAPH = "https://api.haven1.0xgraph.xyz/api/public/bc373e5f-de53-4599-8572-61e112a16f4a/subgraphs/uniswap-v3/main-v0.0.4/";

interface PoolDayData {
  volumeUSD: string;
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
    `query($d:Int!){ poolDayDatas(where: { date: $d }, first: 1000){ volumeUSD } }`,
    { d: date }
  );
  
  const vols = (data.poolDayDatas || [])
    .map((d) => Number(d.volumeUSD))
    .filter(Number.isFinite);
  const dailyVolume = vols.reduce((a, b) => a + b, 0);
  
  return { 
    dailyVolume: dailyVolume.toString() 
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
          Volume: "Daily USD trading volume from all Haven1 HSwap (Uniswap V3 fork) pools"
        }
      }
    },
  },
};

export default adapter;
