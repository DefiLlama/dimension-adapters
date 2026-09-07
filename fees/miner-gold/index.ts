import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { queryDuneSql } from '../../helpers/dune';

// MINER (miner.tools): proof-of-work mining token on Solana with a PvP
// staking game (Caves). Protocol fees, all landing on the fee wallet:
//   1. a flat 5000-lamport fee charged by every Mine instruction,
//   2. 5% of every collapsed Caves pot's SOL side (game rake).
// 100% of those fees fund a daily buyback-and-burn of $MINER, so
// holders revenue equals fees. The fee wallet also does the buyback
// swaps and receives unrelated rent flows, so instead of counting all
// inflows we only sum its balance change in transactions that carry the
// Mine (0x03) or GameSettle (0x11) instruction of the program.
const MINER_PROGRAM = 'FyTBuifdJ1u3rF2bsK2NmjzogkCbNK3KtFfZyM3CUfv1';
const FEE_WALLET = 'D9pvV1SQqYU8d2zcZHkhAdkzuZKaXntkKSNFLsvQvxxu';

const MINE_FEES = 'Mine Fees';
const CAVES_GAME_RAKE = 'Caves Game Rake';

const fetch: any = async (options: FetchOptions) => {
  const sql = `
    WITH program_txs AS (
      SELECT
        tx_id,
        CASE
          WHEN MAX(CASE WHEN bytearray_substring(data, 1, 1) = 0x11 THEN 1 ELSE 0 END) = 1
          THEN 0x11
          ELSE 0x03
        END AS ix
      FROM solana.instruction_calls
      WHERE executing_account = '${MINER_PROGRAM}'
        AND bytearray_substring(data, 1, 1) IN (0x03, 0x11)
        AND tx_success = true
        AND block_time >= from_unixtime(${options.startTimestamp})
        AND block_time < from_unixtime(${options.endTimestamp})
      GROUP BY tx_id
    )
    SELECT
      COALESCE(SUM(CASE WHEN t.ix = 0x03 AND a.post_balance > a.pre_balance
        THEN (a.post_balance - a.pre_balance) / 1e9 ELSE 0 END), 0) AS mine_fees,
      COALESCE(SUM(CASE WHEN t.ix = 0x11 AND a.post_balance > a.pre_balance
        THEN (a.post_balance - a.pre_balance) / 1e9 ELSE 0 END), 0) AS game_fees
    FROM solana.account_activity a
    JOIN program_txs t ON a.tx_id = t.tx_id
    WHERE a.address = '${FEE_WALLET}'
      AND a.block_time >= from_unixtime(${options.startTimestamp})
      AND a.block_time < from_unixtime(${options.endTimestamp})
  `;

  const results = await queryDuneSql(options, sql);
  const row = results[0];

  const dailyFees = options.createBalances();
  dailyFees.addCGToken('solana', row.mine_fees, MINE_FEES);
  dailyFees.addCGToken('solana', row.game_fees, CAVES_GAME_RAKE);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue: dailyFees.clone(1, "$MINER Token Burn"),
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-08-04',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'A flat 5000-lamport fee on every Mine instruction plus 5% of every collapsed Caves game pot (SOL side), both paid to the protocol fee wallet.',
    Revenue: 'A flat 5000-lamport fee on every Mine instruction plus 5% of every collapsed Caves game pot (SOL side), both paid to the protocol fee wallet.',
    ProtocolRevenue: 'The team keeps none of the fees.',
    HoldersRevenue: '100% of fees (A flat 5000-lamport fee on every Mine instruction plus 5% of every collapsed Caves game pot (SOL side)) fund the daily buyback-and-burn of $MINER.',
  },
  breakdownMethodology: {
    Fees: {
      [MINE_FEES]: 'Flat 5000-lamport fee charged on every Mine instruction.',
      [CAVES_GAME_RAKE]: "5% of every collapsed Caves pot's SOL side.",
    },
    Revenue: {
      [MINE_FEES]: 'All mine fees (A flat 5000-lamport fee on every Mine instruction) are protocol revenue.',
      [CAVES_GAME_RAKE]: 'All Caves game rake (5% of every collapsed Caves game pot (SOL side)) is protocol revenue.',
    },
    HoldersRevenue: {
      "$MINER Token Burn": "100% of fees (A flat 5000-lamport fee on every Mine instruction plus 5% of every collapsed Caves game pot (SOL side)) fund the daily buyback-and-burn of $MINER.",
    },
  },
};

export default adapter;
