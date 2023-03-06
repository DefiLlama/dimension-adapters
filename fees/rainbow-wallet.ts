import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";
import postgres from "postgres";

interface IFee {
  contract_address: string;
  volume: number;
}

const fetch = () => {
  return async (timestamp: number): Promise<FetchResultFees> => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
      const sql = postgres(process.env.INDEXA_DB!);
      try {

      const now = new Date(timestamp * 1e3)
      const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24)


      const logs = await sql`
      SELECT
        encode(transaction_hash, 'hex') AS HASH,
        encode(data, 'hex') AS data,
        encode(contract_address, 'hex') AS contract_address
      FROM
        ethereum.event_logs
      WHERE
        topic_0 = '\\xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
        and topic_2 = '\\x00000000000000000000000000000000009726632680fb29d3f7a9734e3010e2'
        AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
      `;


      const log = logs.map((p: any) => {
          const volume =  Number('0x'+p.data)
        return {
          volume: volume,
          contract_address: `0x${p.contract_address}`,
        } as IFee
      });
      const tokens = [...new Set(log.map((e: IFee) => `ethereum:${e.contract_address}`))]
      const prices = await getPrices(tokens, todaysTimestamp);
      const amounts = log.map((p: IFee) => {
        const price = prices[`ethereum:${p.contract_address}`.toLowerCase()]?.price || 0;
        const decimals = prices[`ethereum:${p.contract_address}`.toLowerCase()]?.decimals || 0;
        return (p.volume / 10 ** decimals) * price;
      })
      const volume = amounts.reduce((a: number, b: number) => a+b, 0);
      const dailyFees = volume * .0085;

      await sql.end({ timeout: 3 })
      return {
        timestamp: todaysTimestamp,
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

const methodology = {
  Fees: "Take 0.85% from trading volume",
  Revenue: "Take 0.85% from trading volume",
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
        fetch: fetch(),
        start: async ()  => 1669852800,
        meta: {
          methodology
        }
    },
  },

}

export default adapter;
