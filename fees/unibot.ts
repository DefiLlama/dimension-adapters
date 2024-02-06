import postgres from "postgres";
import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";
import { indexa, toBytea } from "../helpers/db";


interface IData {
  eth_value: string;
}
const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
  const sql = postgres(process.env.INDEXA_DB!);

  const now = new Date(timestamp * 1e3)
  const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24)
  try {
    const to_address = ["0x27B9c20f64920EB7fBF64491423a54DF9594188C"].map(toBytea);
    const router_v2_query = indexa<any[]>`
      SELECT
        sum("value" / 1e18) as eth_value
      FROM
        ethereum.traces
      WHERE
        block_number > 17341451
        and to_address in ${indexa(to_address)}
        AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()}
    `;
    const router_v2 = await router_v2_query.execute();

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
            AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()}
      UNION ALL
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
            and from_address = '\\x3999D2c5207C06BBC5cf8A6bEa52966cabB76d41'
            AND to_address = '\\xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
            AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
    `;

    const transactions_v2: IData[] =  [...router_v2] as IData[]
    const transactions: IData[] =  [...router_v3] as IData[]
    const amount = transactions.reduce((a: number, transaction: IData) => a+Number(transaction.eth_value), 0)
    const amount_v2 = transactions_v2.reduce((a: number, transaction: IData) => a+Number(transaction.eth_value), 0)

    const revFromToken: IData[] = await sql`
        SELECT
          block_number,
          block_time,
          "value" / 1e18 as eth_value,
          encode(transaction_hash, 'hex') AS HASH,
          encode(to_address, 'hex') AS to_address
        FROM
          ethereum.traces
        WHERE
          block_number > 17277183
          AND from_address = '\\xf819d9cb1c2a819fd991781a822de3ca8607c3c9'
          AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()}
    `
    const rev_gen_token: number = revFromToken.reduce((a: number, transaction: IData) => a+Number(transaction.eth_value), 0)

    const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
    const ethPrice = (await getPrices([ethAddress], todaysTimestamp))[ethAddress].price;
    const amountUSD = amount * ethPrice;
    const amountUSD_v2 = amount_v2 * ethPrice;
    const tokenRev = rev_gen_token * ethPrice;
    // ref https://dune.com/queries/2621049/4349967
    const dailyFees = (amountUSD * 0.01) + (amountUSD_v2);
    const dailyRevenue = dailyFees;
    await sql.end({ timeout: 3 })
    return {
      dailyFees: `${dailyFees}`,
      dailyRevenue: `${dailyRevenue}`,
      dailyTokenTaxes: `${tokenRev}`,
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
