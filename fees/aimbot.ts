import postgres from "postgres";
import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";
const axios = require('axios');
const profitShareAPI = "https://aimbotapi.onrender.com/api/openBot/profitShare";
  
interface IData {
  data: string;
  value: string;
}

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
  const sql = postgres(process.env.INDEXA_DB!);
  const now = new Date(timestamp * 1e3)
  const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24)
  try {
    const transfer_txs = await sql`
      SELECT
          value
      FROM
          ethereum.traces
      WHERE
          block_number > 17829271
          AND to_address IN (
              SELECT DISTINCT address
              FROM ethereum.traces
              WHERE
                  block_number > 17829271
                  AND from_address IN ('\\x077905FA422A6C1f45Ad81D305e15dD94f8af56E')
                  AND "type" = 'create'
          )
          and from_address = '\\x0c48250Eb1f29491F1eFBeEc0261eb556f0973C7'
          AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
    `;

    const transactions: IData[] = [...transfer_txs] as IData[]
    const amount = transactions.map((e: IData) => {
      const amount = Number(e.value)/1e18;
      return amount;
    }).reduce((a: number, b: number) => a+b,0);

    // fetch profit data from OpenBot profitShare API
    const openBotFundData = await axios.get(profitShareAPI, (error:Error, response:any, body:string)=> {
      if (!error && response.statusCode === 200) {
        const res = JSON.parse(body);
        console.log("Got a response: ", res);
        return res;
      } else {
        console.log("Got an error: ", error, ", status code: ", response.statusCode);
        return "";
      }
    });
  
    const openBotFundAmount = openBotFundData.data['total'];
    
    const totalAmount = amount + openBotFundAmount;
    const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
    const ethPrice = (await getPrices([ethAddress], todaysTimestamp))[ethAddress].price;
    const amountUSD = Math.abs(totalAmount * ethPrice);
    const dailyFees = amountUSD;
    const dailyRevenue = dailyFees;
    await sql.end({ timeout: 3 })
    return {
      dailyFees: `${dailyFees}`,
      dailyRevenue: `${dailyRevenue}`,
      timestamp
    }
  } catch (error) {
    await sql.end({ timeout: 3 })
    console.error(error);
    throw error;
  }

}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: async () => 1690934400,
    },
  },
};

export default adapter;
