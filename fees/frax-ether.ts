import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";
import postgres from "postgres";

interface IFee {
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
        block_time,
        encode(transaction_hash, 'hex') AS HASH,
        encode(data, 'hex') AS data
      FROM
        ethereum.event_logs
      WHERE
        contract_address = '\\xac3e018457b222d93114458476f3e3416abbe38f'
        and block_number > 15686281
        AND topic_0 = '\\x2fa39aac60d1c94cda4ab0e86ae9c0ffab5b926e5b827a4ccba1d9b5b2ef596e'
        AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
      `;

      const log = logs.map((p: any) => {
          const amount = Number('0x'+p.data) / 10 ** 18;
        return {
          amount: amount
        } as IFee
      });

      const totalRewardAmount = log.reduce((a: number, b: IFee) => a+b.amount, 0);
      const dailyFees = (totalRewardAmount / .90);


      const prices = await getPrices(['coingecko:ethereum'], todaysTimestamp);
      const ethPrice = prices['coingecko:ethereum'].price;
      const dailyFeesUsd = dailyFees * ethPrice;
      const dailySupplySideRevenue = dailyFeesUsd * 0.90;
      const dailyRevenue = dailyFeesUsd * 0.1;

    await sql.end({ timeout: 3 })

    return {
      timestamp,
      dailyFees: dailyFeesUsd.toString(),
      dailySupplySideRevenue: dailySupplySideRevenue.toString(),
      dailyRevenue: dailyRevenue.toString(),
      dailyProtocolRevenue: dailyRevenue.toString(),
      dailyHoldersRevenue: '0',
      dailyUserFees: '0',
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
        start: async ()  => 1665014400,
    },
  }
}

export default adapter;
