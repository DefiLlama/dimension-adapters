import postgres from "postgres";
import { Adapter, FetchResultFees } from "../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { CHAIN } from "../helpers/chains";
import { getPrices } from "../utils/prices";

const fetchFees = async (timestamp: number): Promise<FetchResultFees> => {
  const sql = postgres(process.env.INDEXA_DB!);
  try {
    const now = new Date(timestamp * 1e3)
    const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24)

    const eth_transfer_logs = await sql`
      SELECT
        sum("value") / 1e18 AS eth_value
      FROM
        ethereum.traces
      WHERE
        block_number > 17309203
        AND to_address = '\\xA020d57aB0448Ef74115c112D18a9C231CC86000'
        AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
    `
    const royalties = await sql`
        WITH MinValues AS (
          SELECT
            transaction_hash,
            from_address,
            MIN("value") AS min_value
          FROM
            ethereum.traces
          WHERE
            block_number > 17309203
            AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()}
            AND from_address IN (
              SELECT
              SUBSTRING(topic_1 FROM 13 FOR 20)::bytea AS extracted_bytea
            FROM
              ethereum.event_logs
            WHERE
              block_number > 17309203
              AND contract_address = '\\xA020d57aB0448Ef74115c112D18a9C231CC86000'
              AND topic_0 = '\\xe8e1cee58c33f242c87d563bbc00f2ac82eb90f10a252b0ba8498ae6c1dc241a'
              )
            AND to_address != '\\xA020d57aB0448Ef74115c112D18a9C231CC86000'
            and value > 0
            GROUP BY transaction_hash, from_address
            HAVING COUNT(transaction_hash) > 1
        )
        SELECT
          SUM(min_value) / 1e18 AS royalties_fees
        FROM MinValues;
      `
    const eth_value = Number(eth_transfer_logs[0].eth_value);
    const royalties_fees = Number(royalties[0].royalties_fees);
    const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
    const ethPrice = (await getPrices([ethAddress], timestamp))[ethAddress].price;
    const dailyFees = (eth_value + royalties_fees) * ethPrice;
    const dailyRevenue = (eth_value * ethPrice);
    await sql.end({ timeout: 3 })
    return {
      dailyFees: `${dailyFees}`,
      dailyRevenue: `${dailyRevenue}`,
      timestamp
    }
  } catch (e) {
    await sql.end({ timeout: 3 })
    console.error(e)
    throw e;
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees,
      start: async () => 1684627200
    },
  },
};

export default adapter;
