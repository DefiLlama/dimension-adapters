import postgres from "postgres";
import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";


interface IData {
  data: string;
}
const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
  const sql = postgres(process.env.INDEXA_DB!);

  const now = new Date(timestamp * 1e3)
  const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24)
  try {
    const transfer_txs = await sql`
      SELECT
          block_time,
          encode(transaction_hash, 'hex') AS HASH,
          encode(data, 'hex') AS data
      FROM
          ethereum.event_logs
      WHERE
          block_number > 18332267
          AND contract_address IN (
              SELECT DISTINCT address
              FROM ethereum.traces
              WHERE
                  block_number > 18332267
                  AND from_address IN ('\\x28B108B9932dD9E26103b9d3ed1999d3087F537d')
                  AND "type" = 'create'
          )
          AND topic_0 = '\\x9377d2ca0fa4b8097cf0c9128e900f40fc24811a43eefb75da59072dbbcc8c85'
          AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
    `;

    const transactions: IData[] = [...transfer_txs] as IData[]
    const amount = transactions.map((e: IData) => {
      const amount = Number('0x'+e.data.slice((5 * 64), (5 * 64) + 64)) / 10 ** 18
      return amount;
    }).reduce((a: number, b: number) => a+b,0);

    const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
    const ethPrice = (await getPrices([ethAddress], todaysTimestamp))[ethAddress].price;
    const amountUSD = Math.abs(amount * ethPrice);
    const dailyFees = amountUSD;
    const dailyRevenue = dailyFees;
    await sql.end({ timeout: 3 })
    return {
      dailyFees: `${dailyFees}`,
      dailyRevenue: `${dailyRevenue}`,
      timestamp
    }
  } catch (error) {
    await sql.end({ timeout: 3 })
    console.error(error);
    throw error;
  }

}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: async () => 1697155200,
    },
  },
};

export default adapter;
