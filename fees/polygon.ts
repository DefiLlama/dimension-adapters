import postgres from "postgres";
import { Adapter, ChainBlocks, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";
import { queryFlipside } from "../helpers/flipsidecrypto";

const adapter: Adapter = {
  adapter: {
    [CHAIN.POLYGON]: {
        fetch:  async (timestamp: number, _: ChainBlocks) => {
          const sql = postgres(process.env.INDEXA_DB!);
          const fromTimestamp = timestamp - 60 * 60 * 24
          const toTimestamp = timestamp
          try {
            const startblock = (await getBlock(fromTimestamp, CHAIN.POLYGON, {}));
            const endblock = (await getBlock(toTimestamp, CHAIN.POLYGON, {}));
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
          const maticAddress = "ethereum:0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0";

          const pricesObj = await getPrices([maticAddress], toTimestamp);
          const latestPrice = pricesObj[maticAddress].price;
          const maticBurn = burn_fee;
          const dailyRevenue = maticBurn * latestPrice;

          const dailyFee = tx_fee * latestPrice;
          return {
              timestamp,
              dailyFees: dailyFee.toString(),
              dailyRevenue: dailyRevenue.toString(),
          };
        } catch(error) {
          await sql.end({ timeout: 3 })
          throw error
        }
        },
        // start: async () => 1575158400,
        start: async () => 1672531200
    },
},
  protocolType: ProtocolType.CHAIN
}

export default adapter;
