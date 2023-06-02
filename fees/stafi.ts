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
        block_number  > 17032473
        and contract_address = '\\x44da6289a48f6af8e0917d8688b02b773ba16587'
        AND topic_0 = '\\x805593669516ad95e9aa092bd501707436d9563eac1ef7c017cd6639eb29f8ee'
        AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
      `;

      const log = logs.map((p: any) => {
          const claimableReward = Number('0x'+p.data.slice(128, 192)) / 10 ** 18;
          const claimableDeposit = Number('0x'+p.data.slice(192, 256)) / 10 ** 18;
        return {
          amount: (claimableReward + claimableDeposit),
          claimableReward,
          claimableDeposit
        }
      });

      const totalRewardAmount = log.reduce((a: number, b: IFee) => a+b.amount, 0);
      const dailyFees = totalRewardAmount;
      const prices = await getPrices(['coingecko:ethereum'], todaysTimestamp);
      const ethPrice = prices['coingecko:ethereum'].price;
      const dailyFeesUsd = dailyFees * ethPrice;
      const dailySupplySideRevenue = dailyFeesUsd * 0.90;
      const dailyRevenue = dailyFeesUsd * 0.05;

    await sql.end({ timeout: 3 })

    return {
      timestamp,
      dailyFees: dailyFeesUsd.toString(),
      dailySupplySideRevenue: dailySupplySideRevenue.toString(),
      dailyRevenue: dailyRevenue.toString(),
      dailyProtocolRevenue: dailyRevenue.toString(),
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
