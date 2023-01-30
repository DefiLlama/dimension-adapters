import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import BigNumber from "bignumber.js";
import { getPrices } from "../utils/prices";
import postgres from "postgres";

interface IFee {
  feeRate: string;
  volume: number;
}

interface ISeaPort {
  amount: number;
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
          encode(data, 'hex') AS data
        FROM
          ethereum.event_logs
        WHERE
          block_number > 16324200
          AND contract_address = '\\x000000000000ad05ccc4f10045630fb830b95127'
          AND topic_0 = '\\x61cbb2a3dee0b6064c2e681aadd61677fb4ef319f0b547508d495626f5a62f64'
          AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
      `;
      const seaport_log = await sql`
        SELECT
          encode(transaction_hash, 'hex') AS HASH,
          encode(data, 'hex') AS data
        FROM
          ethereum.event_logs
        WHERE
          block_number > 16480734
          AND contract_address = '\\x00000000006c3852cbef3e08e8df289169ede581'
          AND topic_0 = '\\x9d9af8e38d66c62e2c12f0225249fd9d721c54b83f48d9352c97c6cacdcb6f31'
          AND topic_2 = '\\x0000000000000000000000000000000000d80cfcb8dfcd8b2c4fd9c813482938'
          AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
      `

      const log = logs.map((p: any) => {
          const volume = new BigNumber('0x'+p.data.slice(704, 768)).toString();
          const feeRate = new BigNumber('0x'+p.data.slice(1152, 1216)).toString();
        return {
          volume: Number(volume) / 10 ** 18,
          feeRate: feeRate,
        } as IFee
      });

    const seaport_logs = seaport_log.map((p: any) => {
        const amount1 = new BigNumber('0x'+p.data.slice(832, 896)).toString(); // 13
        const amount2 = new BigNumber('0x'+p.data.slice(1152, 1216)).toString(); // 18
      return {
        amount: Math.min(Number(amount1), Number(amount2)) / 10 ** 18,
      } as ISeaPort
    });

    const dailyFees = log
      .filter(e => e.feeRate !== '0')
      .reduce((p: number , c: IFee) => p + (((Number(c.feeRate)/100)/100) * c.volume), 0);
    const fromSeaPort = seaport_logs.reduce((a: number ,e: ISeaPort) => a+e.amount, 0);
    const prices = await getPrices(['coingecko:ethereum'], todaysTimestamp);
    const ethPrice = prices['coingecko:ethereum'].price;
    const dailyFeesUsd = (dailyFees + fromSeaPort) * ethPrice;

    await sql.end({ timeout: 5 })
    return {
      timestamp,
      dailyFees: dailyFeesUsd.toString(),
    } as FetchResultFees

    } catch (error) {
      await sql.end({ timeout: 5 })
      throw error
    }
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
        fetch: fetch(),
        start: async ()  => 1669852800,
    },
  }
}

export default adapter;
