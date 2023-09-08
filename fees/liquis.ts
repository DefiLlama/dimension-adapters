import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";
import postgres from "postgres";

const OLIT_TOKEN = '0xba100000625a3754423978a60c9317c58a424e3D';

const fetch = () => {
  return async (timestamp: number): Promise<FetchResultFees> => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
      const sql = postgres(process.env.INDEXA_DB!);
      try {

      const now = new Date(timestamp * 1e3)
      const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24)

      const olit_transfer_logs = await sql`
        SELECT
          substr(encode(topic_1, 'hex'), 25) AS origin,
          substr(encode(topic_2, 'hex'), 25) AS destination,
          encode(transaction_hash, 'hex') AS HASH,
          encode(data, 'hex') AS data
        FROM
          ethereum.event_logs
        WHERE
          block_number > 18025939
          AND contract_address = '\\x627fee87d0D9D2c55098A06ac805Db8F98B158Aa'
          AND topic_0 = '\\xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
          AND topic_1 = '\\x0000000000000000000000000000000000000000000000000000000000000000'
          AND topic_2 = '\\x00000000000000000000000037aeB332D6E57112f1BFE36923a7ee670Ee9278b'
          AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
      `;

    const olit_transfer_amounts: number[] = olit_transfer_logs.map((e:any) => {
      return Number('0x'+e.data) / 10 ** 18;
    });

    const olitAddress = `ethereum:${OLIT_TOKEN.toLowerCase()}`;
    const olitPrice = (await getPrices([olitAddress], todaysTimestamp))[olitAddress].price;

    const olit_transfer_amount = olit_transfer_amounts.reduce((a: number, b: number) => a+b,0);
    const dailyFee = olit_transfer_amount * olitPrice;
    const dailySupplySideRevenue = dailyFee * .75
    const dailyRevenue =  dailyFee * .25;
    const dailyHoldersRevenue = dailyFee * .03;

    await sql.end({ timeout: 3 })
    return {
      timestamp: todaysTimestamp,
      dailyFees: dailyFee.toString(),
      dailyRevenue: dailyRevenue.toString(),
      dailySupplySideRevenue: dailySupplySideRevenue.toString(),
      dailyHoldersRevenue: dailyHoldersRevenue.toString(),
    } as FetchResultFees
    } catch (error) {
      await sql.end({ timeout: 3 })
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