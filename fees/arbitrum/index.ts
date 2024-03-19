import { Adapter, FetchOptions, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryFlipside } from "../../helpers/flipsidecrypto";
import { queryIndexer } from "../../helpers/indexer";

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: (async (timestamp: number, _: any, options: FetchOptions) => {
        const { getFromBlock, getToBlock, createBalances, } = options
        const startblock = await getFromBlock()
        const endblock = await getToBlock()
        const dailyFees = createBalances()
        const dailyRevenue = createBalances()

        const sequencerGas = `
            SELECT
              sum(ethereum.transactions.gas_used*ethereum.transactions.gas_price) as sum
            FROM ethereum.transactions
            INNER JOIN ethereum.blocks ON ethereum.transactions.block_number = ethereum.blocks.number
            WHERE ( to_address = '\\x1c479675ad559dc151f6ec7ed3fbf8cee79582b6'::bytea -- Current inbox
            OR to_address = '\\x4c6f947Ae67F572afa4ae0730947DE7C874F95Ef'::bytea -- Arbitrum: Sequencer Inbox
            OR to_address = '\\x51de512aa5dfb02143a91c6f772261623ae64564'::bytea -- Arbitrum: Validator1
            ) AND (block_time BETWEEN llama_replace_date_range);
          `
        // const seqGas: number = sequencerGas[0].sum
        const seqGas: any = await queryIndexer(sequencerGas, options)
        const feeQuery = await queryFlipside(`SELECT SUM(TX_FEE) from arbitrum.core.fact_transactions where BLOCK_NUMBER > ${startblock} AND BLOCK_NUMBER < ${endblock}`)
        const fees = Number(feeQuery[0][0])

        dailyFees.addGasToken(fees * 1e18)
        dailyRevenue.addGasToken(seqGas[0].sum * -1)
        dailyRevenue.addGasToken(fees * 1e18)

        return { timestamp, dailyFees, dailyRevenue, };

      }) as any,
      start: 1628553600
    },
  },
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN
}

export default adapter;
