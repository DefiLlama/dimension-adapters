import { Chain } from "@defillama/sdk/build/general";
import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getPrices } from "../utils/prices";
import postgres from "postgres";

interface IFee {
  contract_address: string;
  volume: number;
}

interface ILog {
  data: string;
  contract_address: string;
}
type TPrice = {
  [s: string]: {
    price: number;
    decimals: number
  };
}
type IToken = {
  [s: string | Chain]: string[];
}
const tokens: IToken = {
  [CHAIN.ETHEREUM]: ['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', '0xdac17f958d2ee523a2206206994597c13d831ec7'],
}

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const now = new Date(timestamp * 1e3)
    const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24)
    const sql = postgres(process.env.INDEXA_DB!);
      try {
      const transfer_logs: ILog[] = await sql`
        SELECT
          encode(data, 'hex') AS data,
          encode(contract_address, 'hex') as contract_address
        FROM
          ethereum.event_logs
        WHERE
          block_number > 15454990
          AND contract_address in ('\\xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', '\\xdac17f958d2ee523a2206206994597c13d831ec7')
          AND topic_0 = '\\xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
          AND topic_2 = '\\x00000000000000000000000004bda42de3bc32abb00df46004204424d4cf8287'
          AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
      `;
      // 0xcdd1b25d - replay
      // 0x3593564c - ex


      const log = transfer_logs.map((a: ILog) => {
          const volume =  Number('0x'+a.data)
        return {
          volume: volume,
          contract_address: '0x'+a.contract_address,
        } as IFee
      });

      const coins = [...new Set(log.map((e: IFee) => `${chain}:${e.contract_address}`.toLowerCase()))]
      const prices: any = (await getPrices(coins, timestamp))

      const amounts = log.map((p: IFee) => {
        const price = prices[`${chain}:${p.contract_address}`.toLowerCase()]?.price || 0;
        const decimals = prices[`${chain}:${p.contract_address}`.toLowerCase()]?.decimals || 0;
        return (p.volume / 10 ** decimals) * price;
      })
      const volume = amounts
        .filter((e: any) => !isNaN(e))
        .filter((e: number) => e < 100_000_000)
        .reduce((a: number, b: number) => a+b, 0);
      const dailyFees = volume;
      await sql.end({ timeout: 3 })
      return {
        timestamp: timestamp,
        dailyFees: dailyFees.toString(),
        dailyRevenue: dailyFees.toString(),
        dailyProtocolRevenue: dailyFees.toString(),
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
        fetch: fetch(CHAIN.ETHEREUM),
        start: async ()  => 1661990400,
    }
  },

}

export default adapter;
