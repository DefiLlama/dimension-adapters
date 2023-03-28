import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";
import postgres from "postgres";

const BAL_TOKEN = '0xba100000625a3754423978a60c9317c58a424e3D';

const fetch = () => {
  return async (timestamp: number): Promise<FetchResultFees> => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
      const sql = postgres(process.env.INDEXA_DB!);
      try {

      const now = new Date(timestamp * 1e3)
      const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24)

      // bal vote
      const bal_transfer_logs = await sql`
        SELECT
          substr(encode(topic_1, 'hex'), 25) AS origin,
          substr(encode(topic_2, 'hex'), 25) AS destination,
          encode(transaction_hash, 'hex') AS HASH,
          encode(data, 'hex') AS data
        FROM
          ethereum.event_logs
        WHERE
          block_number > 14932175
          AND contract_address = '\\xba100000625a3754423978a60c9317c58a424e3D'
          AND topic_0 = '\\xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
          AND topic_1 in('\\x00000000000000000000000026743984e3357eFC59f2fd6C1aFDC310335a61c9', '\\x000000000000000000000000d3cf852898b21fc233251427c2dc93d3d604f3bb')
          AND topic_2 = '\\x000000000000000000000000aF52695E1bB01A16D33D7194C28C42b10e0Dbec2'
          AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
      `;

    // bal vote
      const bal_bal_yield_logs = await sql`
        SELECT
          substr(encode(topic_1, 'hex'), 25) AS origin,
          substr(encode(topic_2, 'hex'), 25) AS destination,
          encode(transaction_hash, 'hex') AS HASH,
          encode(data, 'hex') AS data
        FROM
          ethereum.event_logs
        WHERE
          block_number > 14932175
          AND contract_address = '\\xba100000625a3754423978a60c9317c58a424e3D'
          AND topic_0 = '\\xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
          AND topic_1 not in('\\x00000000000000000000000026743984e3357eFC59f2fd6C1aFDC310335a61c9', '\\x000000000000000000000000d3cf852898b21fc233251427c2dc93d3d604f3bb')
          AND topic_2 = '\\x000000000000000000000000aF52695E1bB01A16D33D7194C28C42b10e0Dbec2'
          AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
      `

      const bbusd_transfer_logs = await sql`
        SELECT
          substr(encode(topic_1, 'hex'), 25) AS origin,
          substr(encode(topic_2, 'hex'), 25) AS destination,
          encode(transaction_hash, 'hex') AS HASH,
          encode(data, 'hex') AS data
        FROM
          ethereum.event_logs
        WHERE
          block_number > 14932175
          AND contract_address in ('\\xA13a9247ea42D743238089903570127DdA72fE44','\\x7b50775383d3d6f0215a8f290f2c9e2eebbeceb2')
          AND topic_0 = '\\xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
          AND topic_1 in('\\x00000000000000000000000026743984e3357eFC59f2fd6C1aFDC310335a61c9', '\\x000000000000000000000000d3cf852898b21fc233251427c2dc93d3d604f3bb')
          AND topic_2 = '\\x000000000000000000000000aF52695E1bB01A16D33D7194C28C42b10e0Dbec2'
          AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
      `

    const bal_transfer_amounts: number[] = bal_transfer_logs.map((e:any) => {
      return Number('0x'+e.data) / 10 ** 18;
    });

    const bal_bal_bal_yield_amounts: number[] = bal_bal_yield_logs.map((e:any) => {
      return Number('0x'+e.data) / 10 ** 18;
    });

    const bbusd_transfer_amounts: number[] = bbusd_transfer_logs.map((e:any) => {
      return Number('0x'+e.data) / 10 ** 18;
    });


    const balAddress = `ethereum:${BAL_TOKEN.toLowerCase()}`;
    const balPrice = (await getPrices([balAddress], timestamp))[balAddress].price;

    const bal_transfer_amount = bal_transfer_amounts.reduce((a: number, b: number) => a+b,0);
    const bbusd_transfer_amount = bbusd_transfer_amounts.reduce((a: number, b: number) => a+b,0);
    const bal_bal_bal_yield_amount = bal_bal_bal_yield_amounts.reduce((a: number, b: number) => a+b,0);
    const revGenByLP = ((bal_transfer_amount + (bal_bal_bal_yield_amount / 4)) * balPrice) + bbusd_transfer_amount;
    const dailyFee = revGenByLP;
    const dailySupplySideRevenue = dailyFee * .75
    const dailyRevenue =  dailyFee * .25;

    await sql.end({ timeout: 3 })
    return {
      timestamp: todaysTimestamp,
      dailyFees: dailyFee.toString(),
      dailyRevenue: dailyRevenue.toString(),
      dailyProtocolRevenue: dailyRevenue.toString(),
      dailySupplySideRevenue: dailySupplySideRevenue.toString(),
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
        start: async ()  => 1669852800,
    },
  },

}

export default adapter;
