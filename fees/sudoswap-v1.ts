import postgres from "postgres";
import { Adapter, FetchResultFees } from "../adapters/types";
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
        block_number > 14645816
        AND to_address = '\\xb16c1342E617A5B6E4b631EB114483FDB289c0A4'
        AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
    `
    const eth_value = Number(eth_transfer_logs[0].eth_value);
    const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
    const ethPrice = (await getPrices([ethAddress], timestamp))[ethAddress].price;
    const dailyFees = eth_value * ethPrice;
    const dailyRevenue = dailyFees;
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
      start: async () => 1672531200
    },
  },
};

export default adapter;
