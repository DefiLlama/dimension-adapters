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
    const router_v2 = await sql`
      SELECT
        block_number,
        block_time,
        "value" / 1e18 as eth_value,
        encode(transaction_hash, 'hex') AS HASH,
        encode(to_address, 'hex') AS to_address
      FROM
        ethereum.traces
      WHERE
        block_number > 17341451
        and to_address = '\\x07490d45a33d842ebb7ea8c22cc9f19326443c75'
        AND from_address = '\\x7a250d5630b4cf539739df2c5dacb4c659f2488d'
      AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
    `;

    const router_v3 = await sql`
      SELECT
        block_number,
        block_time,
        "value" / 1e18 as eth_value,
        encode(transaction_hash, 'hex') AS HASH,
        encode(to_address, 'hex') AS to_address
      FROM
        ethereum.traces
      WHERE
          block_number > 17447804
          and to_address = '\\x3999D2c5207C06BBC5cf8A6bEa52966cabB76d41'
        AND from_address = '\\xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
        AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
    `;
    const transactions: IData[] = [...router_v2, ...router_v3] as IData[]
    const amount = transactions.reduce((a: number, transaction: IData) => a+Number(transaction.eth_value), 0)

    const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
    const ethPrice = (await getPrices([ethAddress], todaysTimestamp))[ethAddress].price;
    const amountUSD = amount * ethPrice;
    // ref https://dune.com/queries/2621049/4349967
    const dailyFees = amountUSD * 0.01;
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
      start: async () => 1684972800,
    },
  },
};

export default adapter;
