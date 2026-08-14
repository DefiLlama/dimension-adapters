import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const WORLD_XYZ_PROGRAM_ID = 'prediCtPZCttYMvm2W3PtxmMxLmT1dtN7riU6Cxh6tM';
const DFLOW_AGGREGATOR_ID = 'DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH';
const CASH_TOKEN_MINT = 'CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH';
const ANCHOR_EVENT_DISCRIMINATOR = '0xe445a52e51cb9a1d';
const SWAP_EVENT_DISCRIMINATOR = '0x40c6cde8260871e2';

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();

  const duneQuery = `
    WITH world_txs AS (
      SELECT DISTINCT tx_id
      FROM solana.instruction_calls
      WHERE executing_account = '${WORLD_XYZ_PROGRAM_ID}'
        AND tx_success
        AND TIME_RANGE
    ),
    swaps AS (
      SELECT
        ic.block_time,
        CASE
          WHEN bytearray_substring(ic.data, 49, 32) = from_base58('${CASH_TOKEN_MINT}')
            THEN CAST(bytearray_to_uint256(bytearray_reverse(bytearray_substring(ic.data, 81, 8))) AS DOUBLE) / 1e6
          WHEN bytearray_substring(ic.data, 89, 32) = from_base58('${CASH_TOKEN_MINT}')
            THEN CAST(bytearray_to_uint256(bytearray_reverse(bytearray_substring(ic.data, 121, 8))) AS DOUBLE) / 1e6
          ELSE 0
        END AS trade_volume
      FROM solana.instruction_calls ic
      JOIN world_txs w ON w.tx_id = ic.tx_id
      WHERE ic.executing_account = '${DFLOW_AGGREGATOR_ID}'
        AND ic.tx_success
        AND ic.block_time >= from_unixtime(${options.fromTimestamp})
        AND ic.block_time < from_unixtime(${options.toTimestamp})
        AND bytearray_substring(ic.data, 1, 8) = ${ANCHOR_EVENT_DISCRIMINATOR}
        AND bytearray_substring(ic.data, 9, 8) = ${SWAP_EVENT_DISCRIMINATOR}
    )
    SELECT COALESCE(SUM(trade_volume), 0) AS volume FROM swaps
  `;
  
  const queryResult = await queryDuneSql(options, duneQuery);
  dailyVolume.addUSDValue(queryResult[0].volume);

  return { dailyVolume };
}

const methodology = {
  Volume: "Volume of all prediction market trades on world.xyz.",
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  start: "2026-06-11",
  doublecounted: true, //kalshi, dflow
  methodology,
}

export default adapter;