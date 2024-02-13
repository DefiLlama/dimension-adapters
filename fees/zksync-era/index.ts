import { Adapter, FetchOptions, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getBlock } from "../../helpers/getBlock";
import { queryFlipside } from "../../helpers/flipsidecrypto";
import { queryIndexer } from "../../helpers/indexer";

const adapter: Adapter = {
  adapter: {
    [CHAIN.ERA]: {
      fetch: (async (timestamp: number, _: any, options: FetchOptions) => {

        const dailyFees = options.createBalances();
        const dailyRevenue = options.createBalances();
        const startblock = (await getBlock(options.fromTimestamp, CHAIN.ETHEREUM, {}));
        const endblock = (await getBlock(options.toTimestamp, CHAIN.ETHEREUM, {}));
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

        const sequencerGas: any = await queryIndexer(`
              SELECT
              sum(t.gas_used * t.gas_price) AS sum
            FROM
              ethereum.transactions t
            WHERE
              from_address = '\\x3527439923a63F8C13CF72b8Fe80a77f6e572092'::bytea -- zkSync Era: Validator
              AND to_address = '\\x3dB52cE065f728011Ac6732222270b3F2360d919'::bytea -- zkSync Era: Validator Timelock
              AND(encode("data", 'hex')
                LIKE '0c4dd810%' -- commitBlocks method
                OR encode("data", 'hex')
                LIKE '7739cbe7%' -- proveBlocks method
                OR encode("data", 'hex')
                LIKE 'ce9dcf16%' -- executeBlocks method
            )
            AND (block_time BETWEEN llama_replace_date_range);
            `, options);
        const seqGas: number = sequencerGas[0].sum
        dailyFees.addGasToken(fees * 1e18)
        dailyRevenue.addGasToken(fees * 1e18)
        dailyRevenue.addGasToken(seqGas * -1)

        return { timestamp, dailyFees, dailyRevenue, }

      }) as any,
      start: 1679616000 // March 24, 2023
    },
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter;
