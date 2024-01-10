import { getBlock } from "../helpers/getBlock";
import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";
import * as sdk from "@defillama/sdk";

const LIT = '0xfd0205066521550d7d7ab19da8f72bb004b4c341';
const OLIT_TOKEN = '0x627fee87d0D9D2c55098A06ac805Db8F98B158Aa';
const topic = 'event Transfer (address indexed from, address indexed to, uint256 amount)';
const topic0 = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const topic1 = '0x0000000000000000000000000000000000000000000000000000000000000000';
const topic2 = '0x00000000000000000000000037aeB332D6E57112f1BFE36923a7ee670Ee9278b';

interface ILog {
  topics: string[];
  data: string;
  transactionHash: string;
}

const fetch = () => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    try {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
      const dayAgo = todaysTimestamp - 60 * 60 * 24;
      const fromBlock = await getBlock(dayAgo, CHAIN.ETHEREUM, {});
			const toBlock = await getBlock(todaysTimestamp, CHAIN.ETHEREUM, {});

      const logs: ILog[] = (await sdk.getEventLogs({
        target: OLIT_TOKEN,
        topic: topic,
        toBlock,
        fromBlock,
        chain: CHAIN.ETHEREUM,
        topics: [topic0, topic1, topic2]
      })) as ILog[];

    const olit_transfer_amounts: number[] = logs.map((e:any) => {
      return Number(e.data) / 10 ** 18;
    });

    const litAddress = `ethereum:${LIT.toLowerCase()}`;
    const litPrice = (await getPrices([litAddress], todaysTimestamp))[litAddress].price;

    const olit_transfer_amount = olit_transfer_amounts.reduce((a: number, b: number) => a+b,0);
    const dailyFee = olit_transfer_amount * (litPrice / 2);
    const dailySupplySideRevenue = dailyFee * .75
    const dailyRevenue =  dailyFee * .25;
    const dailyHoldersRevenue = dailyFee * .03;

    return {
      timestamp: todaysTimestamp,
      dailyFees: dailyFee.toString(),
      dailyRevenue: dailyRevenue.toString(),
      dailySupplySideRevenue: dailySupplySideRevenue.toString(),
      dailyHoldersRevenue: dailyHoldersRevenue.toString(),
    } as FetchResultFees
    } catch (error) {
      throw error
    }
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
        fetch: fetch(),
        start: async ()  => 1693380630,
    },
  },

}

export default adapter;