import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";
import postgres from "postgres";

interface IFee {
  isMarketplaceFees: boolean;
  volume: number;
}

interface IMintFee {
  volume: number;
}

const marketplace_address_fees = '0x000000000000000000000000d1d1d4e36117ab794ec5d4c78cbd3a8904e691d0';

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
          encode(topic_3, 'hex') as topic_3
        FROM
          ethereum.event_logs
        WHERE
          contract_address = '\\x6170b3c3a54c3d8c854934cbc314ed479b2b29a3'
          and topic_0 = '\\x866e6ef8682ddf5f1025e64dfdb45527077f7be70fa9ef680b7ffd8cf4ab9c50'
          AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
      `;

      const hash_sale: string[] = logs.map((e: any) => e.hash);
      const logs_mint = await sql`
        SELECT
          encode(transaction_hash, 'hex') AS HASH,
          encode(data, 'hex') AS data,
        encode(topic_3, 'hex') as topic_3
        FROM
          ethereum.event_logs
        WHERE
          contract_address = '\\xd1d1d4e36117ab794ec5d4c78cbd3a8904e691d0'
          and topic_0 = '\\x3d0ce9bfc3ed7d6862dbb28b2dea94561fe714a1b4d019aa8af39730d1ad7c3d'
          AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
      `;

      const log = logs.map((p: any) => {
        const volume =  Number('0x'+p.data) / 10 ** 18;
        const contract_address = '0x'+p.topic_3
      return {
        volume: volume,
        isMarketplaceFees: contract_address.toLowerCase() === marketplace_address_fees.toLowerCase(),
      } as IFee
    });

      const log_mint = logs_mint
        .filter((e: any) => !hash_sale.includes(e.hash))
        .map((p: any) => {
          const volume =  Number('0x'+p.data) / 10 ** 18;
          return {
            volume: volume,
            tx: '0x'+p.hash
          }
        });

      const royalties_fees = log.filter((e: IFee) => !e.isMarketplaceFees)
        .reduce((a: number, b: IFee) => a+b.volume,0)
      const marketplace_fees = log.filter((e: IFee) => e.isMarketplaceFees)
        .reduce((a: number, b: IFee) => a+b.volume,0)

      const mint_fees = log_mint
        .reduce((a: number, b: IMintFee) => a+b.volume,0)

      const prices = await getPrices(['coingecko:ethereum'], todaysTimestamp);
      const ethPrice = prices['coingecko:ethereum'].price;
      const dailyFeesUsd = (royalties_fees + marketplace_fees + mint_fees) * ethPrice;
      const dailyRevenue = (marketplace_fees + mint_fees) * ethPrice;

      await sql.end({ timeout: 5 })
      return {
        timestamp,
        dailyFees: dailyFeesUsd.toString(),
        dailyRevenue: dailyRevenue.toString(),
        dailyProtocolRevenue: dailyRevenue.toString(),
      } as FetchResultFees

      } catch (error) {
        await sql.end({ timeout: 5 })
        throw error
      }
  }
}

const methodology = {
  Fees: "All royalties + marketplace + mint fees",
  Revenue: "Marketplace fees + mint fees",
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
