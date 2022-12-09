import { Adapter, ChainBlocks, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { getPrices } from "../../utils/prices";
import postgres from 'postgres'

const sql = postgres(process.env.INDEXER_DB!);

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: async (timestamp: number) => {
        const now = new Date(timestamp * 1e3)
        const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24)

        try {

          const gasFees = await sql`
          SELECT
          SUM(arbitrum.transactions.gas_used*arbitrum.transactions.gas_price)/10^18 as sum
          FROM arbitrum.transactions
          INNER JOIN arbitrum.blocks ON arbitrum.transactions.block_number = arbitrum.blocks.number
          WHERE timestamp BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
          `
          const fees = gasFees[0].sum

          const sequencerGas = await sql`
          SELECT
          sum(ethereum.transactions.gas_used*ethereum.transactions.gas_price)/10^18 as sum
          FROM ethereum.transactions
          INNER JOIN ethereum.blocks ON ethereum.transactions.block_number = ethereum.blocks.number
          WHERE ( to_address = '\\x1c479675ad559dc151f6ec7ed3fbf8cee79582b6'::bytea -- Current inbox
          OR to_address = '\\x4c6f947Ae67F572afa4ae0730947DE7C874F95Ef'::bytea -- Arbitrum: Sequencer Inbox 
          OR to_address = '\\x51de512aa5dfb02143a91c6f772261623ae64564'::bytea -- Arbitrum: Validator1
          ) AND (timestamp BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()});
          `
          const seqGas = sequencerGas[0].sum

          const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
          const ethPrice = (await getPrices([ethAddress], timestamp))[ethAddress].price;
          await sql.end({ timeout: 5 })
          return {
            timestamp,
            dailyFees: (fees * ethPrice).toString(),
            dailyRevenue: ((fees - seqGas) * ethPrice).toString(),
          };
        } catch (error) {
          await sql.end({ timeout: 5 })
          throw error
        }

      },
      start: async () => 1575158400
    },
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter;
