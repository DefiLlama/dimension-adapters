import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";
import postgres from "postgres";

interface IFee {
  transaction_hash: string;
  creator_fee: number;
  marketplace_fee: number;
  volume: number;
}

type TDataPosition = {
  [a: number]: number[];
}

const dataProsition : TDataPosition = {
  2048: [0,  0,  0],
  2176: [12, 32, 0],
  2240: [12, 33, 0],
  2304: [12, 32, 34],
  2368: [12, 33, 35],
  2816: [16, 40, 42],
  2688: [16, 40, 0],
  2880: [17, 43, 0],
  3008: [17, 43, 45],
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
          block_number > 16219860
          AND contract_address = '\\x74312363e45dcaba76c59ec49a7aa8a65a67eed3'
          AND topic_0 = '\\x3cbb63f144840e5b1b0a38a7c19211d2e89de4d7c5faf8b2d3c1776c302d1d33'
          AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
      `;

      const log = logs.map((p: any) => {
          const type = p.data.length;
          const [vol, mfee, cfee] = dataProsition[type];
          const volume = vol !== 0 ? Number('0x'+p.data.slice(vol*64, (vol*64)+64)) / 10 ** 18: 0;
          const marketplace_fee_percent = mfee !== 0 ? Number('0x'+p.data.slice(mfee*64, (mfee*64)+64)) / 10 ** 6: 0;
          const creator_fee_precent = cfee !== 0 ? Number('0x'+p.data.slice(cfee*64, (cfee*64)+64)) / 10 ** 6 : 0;
        return {
          creator_fee: creator_fee_precent * volume,
          marketplace_fee: marketplace_fee_percent * volume,
          volume: volume,
          transaction_hash: '0x'+p.hash,
        } as IFee
      });

    const dailyFees = log
      .reduce((p: number , c: IFee) => p + (c.creator_fee + c.marketplace_fee), 0);

    const dailyRevenue = log
      .reduce((p: number , c: IFee) => p + c.marketplace_fee, 0);

    const prices = await getPrices(['coingecko:ethereum'], todaysTimestamp);
    const ethPrice = prices['coingecko:ethereum'].price;
    const dailyFeesUsd = dailyFees * ethPrice;
    const dailyRevenueUsd = dailyRevenue * ethPrice;

    await sql.end({ timeout: 3 })
    return {
      timestamp,
      dailyFees: dailyFeesUsd.toString(),
      dailyRevenue: dailyRevenueUsd.toString(),
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
        fetch: fetch(),
        start: 1671321600,
    },
  }
}

export default adapter;
