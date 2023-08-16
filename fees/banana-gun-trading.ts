import postgres from "postgres";
import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";


interface IData {
  eth_value: string;
}
const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
  const sql = postgres(process.env.INDEXA_DB!);

  const now = new Date(timestamp * 1e3)
  const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24)
  try {
    const transfer_txs = await sql`
          WITH UnionedData AS (
            SELECT
                encode(transaction_hash, 'hex') AS HASH,
                value,
                block_time
            FROM
                ethereum.traces
            WHERE
                block_number > 17345415
                AND to_address IN (
                    SELECT DISTINCT address
                    FROM ethereum.traces
                    WHERE
                        block_number > 17345415
                        AND from_address IN ('\\xf414d478934c29d9a80244a3626c681a71e53bb2', '\\x37aab97476ba8dc785476611006fd5dda4eed66b')
                        AND "type" = 'create'
                )

            UNION ALL

            SELECT
                encode(transaction_hash, 'hex') AS HASH,
                -value AS value,
                block_time
            FROM
                ethereum.traces
            WHERE
                block_number > 17345415
                AND from_address IN (
                    SELECT DISTINCT address
                    FROM ethereum.traces
                    WHERE
                        block_number > 17345415
                        AND from_address IN ('\\xf414d478934c29d9a80244a3626c681a71e53bb2', '\\x37aab97476ba8dc785476611006fd5dda4eed66b')
                        AND "type" = 'create'
                )
        )

        SELECT
            HASH,
            value / 1e18 as eth_value,
            block_time
        FROM UnionedData WHERE block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
    `;

    const transactions: IData[] = [...transfer_txs] as IData[]
    const amount = transactions.reduce((a: number, transaction: IData) => a+Number(transaction.eth_value), 0)

    const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
    const ethPrice = (await getPrices([ethAddress], todaysTimestamp))[ethAddress].price;
    const amountUSD = amount * ethPrice;
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
