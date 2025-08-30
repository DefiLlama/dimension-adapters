import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { httpPost } from "../../utils/fetchURL"

const SUBGRAPH = "https://api.haven1.0xgraph.xyz/api/public/bc373e5f-de53-4599-8572-61e112a16f4a/subgraphs/uniswap-v3/main-v0.0.4/";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const startOfDay = options.startOfDay;
  const res = await httpPost(SUBGRAPH, {
    query: `query($d:Int!){ poolDayDatas(where: { date: $d }, first: 1000){ volumeUSD } }`,
    variables: { d: startOfDay },
  });

  const vols = (res.data.poolDayDatas || [])
    .map((d) => Number(d.volumeUSD))
    .filter(Number.isFinite);
  const dailyVolume = vols.reduce((a, b) => a + b, 0);

  return {
    dailyVolume: dailyVolume.toString()
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.HAVEN1],
  start: '2025-04-24'
};

export default adapter;
