import postgres from "postgres";
import { Adapter, ChainBlocks, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";
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
          const sql = postgres(process.env.INDEXA_DB!);
          const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
          const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp)
          try {
            const now = new Date(timestamp * 1e3)
            const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24)


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

            const burnTx = await sql`
              SELECT
                encode(transaction_hash, 'hex') AS HASH,
                encode(data, 'hex') AS data
              FROM
                ethereum.event_logs
              WHERE
                block_number > 13982478
                AND contract_address = '\\x7d1afa7b718fb893db30a3abc0cfc608aacfebb0'
                AND topic_0 = '\\xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
                AND topic_1 = '\\x00000000000000000000000070bca57f4579f58670ab2d18ef16e02c17553c38'
                AND topic_2 = '\\x000000000000000000000000000000000000000000000000000000000000dead'
                AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
          `
            const maticAddress = "ethereum:0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0";

            const pricesObj = await getPrices([maticAddress], todaysTimestamp);
            const latestPrice = pricesObj[maticAddress.toLowerCase()].price;
            const decimals =   pricesObj[maticAddress.toLowerCase()].decimals;
            const maticBurn = burnTx.map((a: any) => Number('0x'+a.data)).reduce((a: number, b: number) => a+b,0) / 10 ** decimals;
            const dailyRevenue = maticBurn * latestPrice;

            const graphResDaily: IDailyResponse = await request(URL, graphQueryDaily);
            const graphResTotal: IValue[] = (await request(URL, graphQueryTotal)).fees;

            const dailyFee = Number(graphResDaily.yesterday.totalFeesUSD) - Number(graphResDaily.today.totalFeesUSD)
            const totalFees = Number(graphResTotal[0].totalFeesUSD);
            await sql.end({ timeout: 3 })
            return {
                timestamp,
                totalFees: totalFees.toString(),
                dailyFees: dailyFee.toString(),
                dailyRevenue: dailyRevenue.toString(),
            };
        } catch(error) {
          await sql.end({ timeout: 3 })
          throw error
        }
        },
        start: async () => 1575158400
    },
},
  protocolType: ProtocolType.CHAIN
}

export default adapter;
