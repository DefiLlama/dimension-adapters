import postgres from "postgres";
import { DISABLED_ADAPTER_KEY, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";
import disabledAdapter from "../helpers/disabledAdapter";


interface IData {
  eth_value: string;
}
const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
  const sql = postgres(process.env.INDEXA_DB!);

  const now = new Date(timestamp * 1e3)
  const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24)
  try {
    const revenue_split = await sql`
      SELECT
        block_number,
        block_time,
        "value" / 1e18 as eth_value,
        encode(transaction_hash, 'hex') AS HASH,
        encode(to_address, 'hex') AS to_address
      FROM
        ethereum.traces
      WHERE
        block_number > 17812609
        and to_address = '\\x9c0096a7668ffe704b7c90c94f69dfac71876722'
        AND from_address = '\\x17272b36596dd16041a6aea49304b7bfec221a15'
        and error is null
        AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
    `;

    const transactions: IData[] = [...revenue_split] as IData[]
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
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: async () => 1690675200,
    },
  },
};

export default adapter;
