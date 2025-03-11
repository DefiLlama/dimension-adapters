
import request from "graphql-request";
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

const historical = "https://api.goldsky.com/api/public/project_cm33d1338c1jc010e715n1z6n/subgraphs/punch-swap-core-subgraph-flow-mainnet/2.3.0/gn";


const fetch: any = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const query = `{
  uniswapDayDatas (where: { date: ${dayTimestamp}}){
    date
    dailyVolumeUSD
    
  } 
}`
  const res = await request(historical, query);
  return {
    dailyVolume: res.uniswapDayDatas[0].dailyVolumeUSD,
  }
};


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.FLOW]: {
      fetch,
    },
  },
};

export default adapter;
