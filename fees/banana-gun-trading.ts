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
          block_number > 17345415
          AND contract_address IN (
              SELECT DISTINCT address
              FROM ethereum.traces
              WHERE
                  block_number > 17345415
                  AND from_address IN ('\\xf414d478934c29d9a80244a3626c681a71e53bb2', '\\x37aab97476ba8dc785476611006fd5dda4eed66b')
                  AND "type" = 'create'
          )
          AND topic_0 = '\\x0c2a2f565c7774c59e49ef6b3c255329f4d254147e06e724d3a8569bb7bd21ad'
          AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
    `;

    const transactions: IData[] = [...transfer_txs] as IData[]
    const amount = transactions.map((e: IData) => {
      const amount = Number('0x'+e.data.slice(0, 64)) / 10 ** 18
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
      start: async () => 1685577600,
    },
  },
};

export default adapter;
