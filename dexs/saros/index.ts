import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

const SAROS_AMM_PROGRAM = 'SSwapUtytfBdBn1b9NUGG6foMVPtcWgpRU32HToDUZr'

async function fetch(options: FetchOptions) {
  const [row] = await queryAllium(`
    SELECT
      (SELECT SUM(usd_amount) FROM solana.dex.trades
        WHERE program_id = '${SAROS_AMM_PROGRAM}'
          AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
          AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})) AS volume,
      EXISTS (SELECT 1 FROM solana.dex.trades
        WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.endTimestamp})
          AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp + 3600})) AS indexed
  `)
  if (!row?.indexed) throw new Error(`saros: Allium has not indexed Solana trades after ${options.endTimestamp} yet`)

  const dailyVolume = options.createBalances()
  dailyVolume.addUSDValue(Number(row.volume ?? 0))
  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2021-12-16',
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology: {
    Volume: 'Swap volume on Saros AMM pools on Solana, including swaps routed through aggregators, valued at the lower of the two legs.',
  },
};
export default adapter;
