import { Adapter, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getPrices } from "../../utils/prices";
import postgres from 'postgres'
import { getBlock } from "../../helpers/getBlock";
import { queryFlipside } from "../../helpers/flipsidecrypto";

const adapter: Adapter = {
  adapter: {
    [CHAIN.ERA]: {
      fetch: async (timestamp: number) => {
        const sql = postgres(process.env.INDEXA_DB!);
        const now = new Date(timestamp * 1e3)
        const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24)

        try {
          const fromTimestamp = timestamp - 60 * 60 * 24
          const toTimestamp = timestamp

          const startblock = (await getBlock(fromTimestamp, CHAIN.ERA, {}));
          const endblock = (await getBlock(toTimestamp, CHAIN.ERA, {}));
          // Flipside doesn't currently support zkSync Era so collect fee data from fee collecting address's on L1
          const feeQuery = await queryFlipside(`
            SELECT 
              SUM(AMOUNT)
            FROM ethereum.core.ez_eth_transfers 
            WHERE (
                eth_to_address = lower('0xfeeE860e7AAE671124e9a4E61139f3A5085dFEEE')
             OR eth_to_address = lower('0xA9232040BF0E0aEA2578a5B2243F2916DBfc0A69')
            )
            AND BLOCK_NUMBER > ${startblock} AND BLOCK_NUMBER < ${endblock}
          `)

          const fees = Number(feeQuery[0][0])

          const sequencerGas = await sql`
            SELECT
              sum(t.gas_used * t.gas_price)/10^18 as sum
            FROM ethereum.transactions
            INNER JOIN ethereum.blocks ON ethereum.transactions.block_number = ethereum.blocks.number
            WHERE from_address = '\\x3527439923a63F8C13CF72b8Fe80a77f6e572092'::bytea -- zkSync Era: Validator
            AND to_address = '\\x3dB52cE065f728011Ac6732222270b3F2360d919'::bytea -- zkSync Era: Validator Timelock
            AND (
                 input LIKE E'\\x0c4dd810%'::bytea -- commitBlocks method
              OR input LIKE E'\\x7739cbe7%'::bytea -- proveBlocks method
              OR input LIKE E'\\xce9dcf16%'::bytea -- executeBlocks method
            )
            AND (block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()});
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
      start: async () => 1679616000 // March 24, 2023
    },
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter;
