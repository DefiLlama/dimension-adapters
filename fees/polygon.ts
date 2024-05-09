import ADDRESSES from '../helpers/coreAssets.json'
import { Adapter, ChainBlocks, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryFlipside } from "../helpers/flipsidecrypto";

const adapter: Adapter = {
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: async (timestamp: number, _: ChainBlocks, options: FetchOptions) => {
        const dailyFees = options.createBalances();
        const dailyRevenue = options.createBalances();
        const startblock = await options.getFromBlock()
        const endblock = await options.getToBlock()

        const query_tx_fee = `WITH TransactionTotals AS (
              SELECT
                  BLOCK_NUMBER,
                  COALESCE(SUM(tx_fee), 0) AS tx_fee
              FROM
                  polygon.core.fact_transactions
              WHERE
                  BLOCK_NUMBER > ${startblock}
                  AND BLOCK_NUMBER < ${endblock}
              GROUP BY
                  BLOCK_NUMBER
          ),
          BlockTotals AS (
              SELECT
                  BLOCK_NUMBER,
                  SUM(
                      COALESCE(BLOCK_HEADER_JSON['baseFeePerGas'], 0) * BLOCK_HEADER_JSON['gasUsed']
                  ) / 1e18 AS burned
              FROM
                  polygon.core.fact_blocks
              WHERE
                  BLOCK_NUMBER > ${startblock}
                  AND BLOCK_NUMBER < ${endblock}
              GROUP BY
                  BLOCK_NUMBER
          )
          SELECT
              COALESCE(SUM(tt.tx_fee), 0) AS total_tx_fee,
              COALESCE(SUM(bt.burned), 0) AS total_burned
          FROM
              TransactionTotals tt
          LEFT JOIN
              BlockTotals bt ON tt.BLOCK_NUMBER = bt.BLOCK_NUMBER;`

        const [tx_fee, burn_fee]: number[] = (await queryFlipside(query_tx_fee, 260)).flat();
        const maticAddress = "ethereum:" + ADDRESSES.ethereum.MATIC;

        dailyFees.addTokenVannila(maticAddress, tx_fee * 1e18);
        dailyRevenue.addTokenVannila(maticAddress, burn_fee * 1e18);
        return { timestamp, dailyFees, dailyRevenue, };
      },
      // start: 1575158400,
      start: 1672531200
    },
  },
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN
}

export default adapter;
