import postgres from "postgres";
import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getPrices } from "../utils/prices";

interface tokenInfo {
  token: string;
  amount: number;
}
const fetchFees = async (timestamp: number): Promise<FetchResultFees> => {
    const sql = postgres(process.env.INDEXA_DB!);
    try {
        const now = new Date(timestamp * 1e3)
        const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24)
        const token_tranfer = await sql`
          SELECT
            '0x' || encode(contract_address, 'hex') AS contract_address,
            '0x' || encode(data, 'hex') AS data
          FROM
            ethereum.event_logs
          WHERE
            block_number > 18323016
            AND topic_0 = '\\xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
            AND topic_1 = '\\x0000000000000000000000003fc91a3afd70395cd496c647d5a6cc9d4b2b7fad'
            AND topic_2 in ('\\x00000000000000000000000037a8f295612602f2774d331e562be9e61b83a327','\\x0000000000000000000000006460d14dbaeb27aefec8ebef85db35defa31c3b9')
            AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
        `;

        const token_info: tokenInfo[] = token_tranfer.map((item: any) => {
          const token = item.contract_address;
          const amount = Number(item.data);
          return {
            token,
            amount
          }
        })

        const coins = [...new Set(token_info.map((item: any) => `${CHAIN.ETHEREUM}:${item.token}`))];
        const prices = await getPrices(coins, timestamp);
        const fees = token_info.reduce((acc: number, item: any) => {
          const price = prices[`${CHAIN.ETHEREUM}:${item.token}`]?.price || 0;
          const decimals = prices[`${CHAIN.ETHEREUM}:${item.token}`]?.decimals || 0;
          if (price === 0 || decimals === 0) return acc;
          const fee = (Number(item.amount) / 10 ** decimals) * price;
          return acc + fee;
        }, 0)
        const dailyFees = fees;
        const dailyRevenue = dailyFees;
        const dailyProtocolRevenue = dailyFees;
        await sql.end({ timeout: 3 })
        return {
          dailyFees: `${dailyFees}`,
          dailyProtocolRevenue: `${dailyProtocolRevenue}`,
          dailyRevenue: `${dailyRevenue}`,
          timestamp
      }
    } catch (e) {
      await sql.end({ timeout: 3 })
      console.error(e)
      throw e
    }

}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees,
      start: async () => 1696896000
    }
  }
}
export default adapters;
