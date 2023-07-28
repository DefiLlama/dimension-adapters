import { Adapter, ChainBlocks, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";
const { request, gql } = require("graphql-request");


const URL = 'https://api.thegraph.com/subgraphs/name/liquity/liquity'
interface IValue {
  totalBorrowingFeesPaid: string;
  totalRedemptionFeesPaid: string;
}
interface IDailyResponse {
  yesterday: IValue;
  today: IValue;
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
        fetch:  async (timestamp: number, _: ChainBlocks) => {
          const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
          const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp)

          const startOfDayBlock = (await getBlock(todaysTimestamp, "ethereum", {}));
          const endOfDayBlock = (await getBlock(yesterdaysTimestamp, "ethereum", {}));

          const graphQueryDaily = gql
          `query fees($startOfDayBlock: Int!, $endOfDayBlock: Int!) {
            yesterday: global(id: "only", block: {number: $startOfDayBlock}) {
              totalBorrowingFeesPaid
              totalRedemptionFeesPaid
            }
            today: global(id: "only", block: {number: $endOfDayBlock}) {
              totalBorrowingFeesPaid
              totalRedemptionFeesPaid
            }
          }`;


          const graphResDaily: IDailyResponse = await request(URL, graphQueryDaily, {startOfDayBlock, endOfDayBlock});
          const borrowingFees =   Number(graphResDaily.today.totalBorrowingFeesPaid) - Number(graphResDaily.yesterday.totalBorrowingFeesPaid);
          const redemptionFeesETH = Number(graphResDaily.today.totalRedemptionFeesPaid) - Number(graphResDaily.yesterday.totalRedemptionFeesPaid);

          const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
          const pricesObj: any = await getPrices([ethAddress], todaysTimestamp);
          const latestPrice = pricesObj[ethAddress]["price"]
          const redemptionFeesUSD = redemptionFeesETH * latestPrice;
          const dailyFee = borrowingFees + redemptionFeesUSD;

          return {
              timestamp,
              dailyFees: dailyFee.toString(),
              dailyRevenue: dailyFee.toString(),
              dailyHoldersRevenue: dailyFee.toString(),
          };
        },
        start: async () => 1575158400
    },
  }
}

export default adapter;
