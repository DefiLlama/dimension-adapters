import { Adapter, ChainBlocks, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
const { request, gql } = require("graphql-request");


const URL = 'https://api.thegraph.com/subgraphs/name/dmihal/polygon-fees'
interface IValue {
  totalFeesUSD: string;
}
interface IDailyResponse {
  yesterday: IValue;
  today: IValue;
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.POLYGON]: {
        fetch:  async (timestamp: number, _: ChainBlocks) => {
          const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
          const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp)

          const todaysBlock = (await getBlock(todaysTimestamp, "polygon", {}));
          const yesterdaysBlock = (await getBlock(yesterdaysTimestamp, "polygon", {}));

          const graphQueryDaily = gql
          `query fees {
            yesterday: fee(id: "1", block: {number: ${yesterdaysBlock}}) {
              totalFeesUSD
            }
            today: fee(id: "1", block: {number: ${todaysBlock}}) {
              totalFeesUSD
            }
          }`;

          const graphQueryTotal = gql
          `query fees_total {
            fees(block: {number: ${todaysBlock}}) {
              totalFeesUSD
            }
          }`;

          const graphResDaily: IDailyResponse = await request(URL, graphQueryDaily);
          const graphResTotal: IValue[] = (await request(URL, graphQueryTotal)).fees;

          const dailyFee = Number(graphResDaily.yesterday.totalFeesUSD) - Number(graphResDaily.today.totalFeesUSD)
          const totalFees = Number(graphResTotal[0].totalFeesUSD);
          return {
              timestamp,
              totalFees: totalFees.toString(),
              dailyFees: dailyFee.toString(),
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
