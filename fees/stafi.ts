import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";
import postgres from "postgres";
// import { ethers } from "ethers";

interface IFee {
  userAmount: number;
  nodeAmount: number;
  platformAmount: number;
}

// const DistributeFee = 'event DistributeFee(uint256 dealedHeight,uint256 userAmount,uint256 nodeAmount,uint256 platformAmount)'
// const  DistributeSuperNodeFee = 'event DistributeSuperNodeFee(uint256 dealedHeight,uint256 userAmount,uint256 nodeAmount,uint256 platformAmount)'


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
        AND topic_0 = '\\x21c58bec2fee2b8fa31ce6802a99242adf6226b7ca63d69966c2036047374382'
        AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
      `;

      const logs_2 = await sql`
      SELECT
        block_time,
        encode(transaction_hash, 'hex') AS HASH,
        encode(data, 'hex') AS data
      FROM
        ethereum.event_logs
      WHERE
        block_number  > 17032473
        and contract_address = '\\x44da6289a48f6af8e0917d8688b02b773ba16587'
        AND topic_0 = '\\x4b6a75e8741caebe2695484108d8f5df71d33d430e453b66f68aa802f172edf7'
        AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
      `;

      const log_1 = logs.map((p: any) => {
          const userAmount = Number('0x'+p.data.slice(64, 128)) / 10 ** 18;
          const nodeAmount = Number('0x'+p.data.slice(128, 192)) / 10 ** 18;
          const platformAmount = Number('0x'+p.data.slice(192, 256)) / 10 ** 18;
        return {
          userAmount,
          nodeAmount,
          platformAmount
        }
      });

      const log_2_raw = logs_2.map((p: any) => {
        const userAmount = Number('0x'+p.data.slice(64, 128)) / 10 ** 18;
        const nodeAmount = Number('0x'+p.data.slice(128, 192)) / 10 ** 18;
        const platformAmount = Number('0x'+p.data.slice(192, 256)) / 10 ** 18;
      return {
        userAmount,
        nodeAmount,
        platformAmount
      }
    });

      const totalRewardAmount = log_1.concat(log_2_raw).reduce((a: number, b: IFee) => a+b.userAmount+b.nodeAmount+b.platformAmount, 0);
      const dailyFees = totalRewardAmount;
      const dailySSR = log_1.concat(log_2_raw).reduce((a: number, b: IFee) => a+b.userAmount, 0);
      const dailyRevenueRaw = log_1.concat(log_2_raw).reduce((a: number, b: IFee) => a+b.platformAmount, 0);
      const prices = await getPrices(['coingecko:ethereum'], todaysTimestamp);
      const ethPrice = prices['coingecko:ethereum'].price;
      const dailyFeesUsd = dailyFees * ethPrice;
      const dailySupplySideRevenue = dailySSR * ethPrice;
      const dailyRevenue = dailyRevenueRaw * ethPrice;

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
