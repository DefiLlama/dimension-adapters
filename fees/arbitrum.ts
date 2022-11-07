import { Adapter, ChainBlocks, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";
const { request, gql } = require("graphql-request");


const URL = 'https://api.thegraph.com/subgraphs/name/dmihal/arbitrum-fees-collected'
interface IValue {
  totalFeesETH: string;
}
interface IDailyResponse {
  yesterday: IValue;
  today: IValue;
}

interface ITx {
  value: string;
}

const getUniswapDateId = (date?: Date) => getUniqStartOfTodayTimestamp(date) / 86400;

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
        fetch:  async (timestamp: number, _: ChainBlocks) => {
          const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
          const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp)

          const todaysId = getUniswapDateId(new Date(todaysTimestamp * 1000));
          const yesterdaysId = getUniswapDateId(new Date(yesterdaysTimestamp * 1000));

          const graphQueryDaily = gql
          `query fees {
            yesterday: fee(id: ${yesterdaysId}) {
              totalFeesETH
            }
            today: fee(id: ${todaysId}) {
              totalFeesETH
            }
          }`;

          const graphResDaily: IDailyResponse = await request(URL, graphQueryDaily);
          const pricesObj = await getPrices(["coingecko:ethereum"], todaysTimestamp);
          const feesETH = Number(graphResDaily.yesterday.totalFeesETH) - Number(graphResDaily.today.totalFeesETH);
          const dailyFees = feesETH * pricesObj["coingecko:ethereum"].price
          return {
              timestamp,
              totalFees: undefined,
              dailyFees: dailyFees.toString(),
              totalRevenue: "0",
              dailyRevenue: "0",
          };
        },
        start: async () => 1575158400
    },
},
  protocolType: ProtocolType.CHAIN
}

export default adapter;
