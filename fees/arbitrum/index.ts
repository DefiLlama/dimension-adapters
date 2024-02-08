import { Adapter, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getPrices } from "../../utils/prices";
import postgres from 'postgres'
import { getBlock } from "../../helpers/getBlock";
import { queryFlipside } from "../../helpers/flipsidecrypto";

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: async (timestamp: number) => {
        const sql = postgres(process.env.INDEXA_DB!);
        const now = new Date(timestamp * 1e3)
        const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24)

        try {
          const fromTimestamp = timestamp - 60 * 60 * 24
          const toTimestamp = timestamp

          const startblock = (await getBlock(fromTimestamp, CHAIN.ARBITRUM, {}));
          const endblock = (await getBlock(toTimestamp, CHAIN.ARBITRUM, {}));
          const feeQuery = await queryFlipside(`SELECT SUM(TX_FEE) from arbitrum.core.fact_transactions where BLOCK_NUMBER > ${startblock} AND BLOCK_NUMBER < ${endblock}`)

          const fees = Number(feeQuery[0][0])

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
          const ethPrice = (await getPrices([ethAddress], toTimestamp))[ethAddress].price;
          await sql.end({ timeout: 3 })
          return {
            timestamp: toTimestamp,
            dailyFees: (fees * ethPrice).toString(),
            dailyRevenue: ((fees - seqGas) * ethPrice).toString(),
          };
        } catch (error) {
          await sql.end({ timeout: 3 })
          throw error
        }

      },
      start: 1628553600
    },
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter;
