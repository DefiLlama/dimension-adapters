import { Adapter, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { getPrices } from "../../utils/prices";
import postgres from 'postgres'
import { request, gql } from "graphql-request";

const ARBITRUM_FEES_URL = "https://api.thegraph.com/subgraphs/name/dmihal/arbitrum-fees-collected";

interface IFee {
  totalFeesETHNitro: string;
  totalFeesETH: string;
}

interface IGraph {
  yesterday: IFee;
  today: IFee;
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: async (timestamp: number) => {
        const sql = postgres(process.env.INDEXA_DB!);
        const now = new Date(timestamp * 1e3)
        const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24)

        try {
          const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
          const startDateId = Math.floor(todaysTimestamp / 86400);
          const endDateId = startDateId + 1;
          const query = gql`
          query txFees($startDateId: String!, $endDateId: String!){
            yesterday: fee(id: $startDateId) {
              totalFeesETH
            }
            today: fee(id: $endDateId) {
              totalFeesETH
            }
          }`;
          const res: IGraph  = await request(ARBITRUM_FEES_URL, query, {startDateId: startDateId.toString(), endDateId: endDateId.toString()});

          const fees = Number(res.today.totalFeesETH) - Number(res.yesterday.totalFeesETH);

          const sequencerGas = await sql`
            SELECT
              sum(ethereum.transactions.gas_used*ethereum.transactions.gas_price)/10^18 as sum
            FROM ethereum.transactions
            INNER JOIN ethereum.blocks ON ethereum.transactions.block_number = ethereum.blocks.number
            WHERE ( to_address = '\\x1c479675ad559dc151f6ec7ed3fbf8cee79582b6'::bytea -- Current inbox
            OR to_address = '\\x4c6f947Ae67F572afa4ae0730947DE7C874F95Ef'::bytea -- Arbitrum: Sequencer Inbox
            OR to_address = '\\x51de512aa5dfb02143a91c6f772261623ae64564'::bytea -- Arbitrum: Validator1
            ) AND (block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()});
          `
          const seqGas: number = sequencerGas[0].sum

          const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
          const ethPrice = (await getPrices([ethAddress], todaysTimestamp))[ethAddress].price;
          await sql.end({ timeout: 3 })
          return {
            timestamp: todaysTimestamp,
            dailyFees: (fees * ethPrice).toString(),
            dailyRevenue: ((fees - seqGas) * ethPrice).toString(),
          };
        } catch (error) {
          await sql.end({ timeout: 3 })
          throw error
        }

      },
      start: async () => 1575158400
    },
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter;
