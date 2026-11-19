import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types';
import { queryAllium } from '../../helpers/allium';
import { CHAIN } from '../../helpers/chains';

// PepeBoost fee receiver, same identification as the Dune spellbook model pepe_boost_solana.bot_trades
// https://github.com/duneanalytics/spellbook/blob/main/dbt_subprojects/solana/models/_sector/dex/bot_trades/solana/platforms/pepe_boost_solana_bot_trades.sql
const FEE_WALLET = 'G9PhF9C9H83mAjjkdJz4MDqkufiTPMJkx7TnKE1kFyCp';

const fetch = async (options: FetchOptions) => {
  const timeRange = (alias: string) =>
    `${alias}.block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND ${alias}.block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})`;

  // Bot trades are swaps in transactions that pay SOL to the PepeBoost fee wallet.
  // dex.trades is hop-level: keep only the last hop of each top-level instruction.
  const [row] = await queryAllium(`
    WITH fee_txs AS (
      SELECT DISTINCT tr.txn_id
      FROM solana.assets.transfers tr
      WHERE ${timeRange('tr')}
        AND tr.to_address = '${FEE_WALLET}'
        AND tr.transfer_type = 'sol_transfer'
        AND tr.signer <> '${FEE_WALLET}'
    ),
    bot_trades AS (
      SELECT t.usd_amount
      FROM solana.dex.trades t
      JOIN fee_txs f ON t.txn_id = f.txn_id
      WHERE ${timeRange('t')}
        AND t.sender_address <> '${FEE_WALLET}'
      QUALIFY ROW_NUMBER() OVER (
        PARTITION BY t.txn_id, t.instruction_index
        ORDER BY COALESCE(t.inner_instruction_index, -1) DESC
      ) = 1
    ),
    totals AS (
      SELECT COUNT(*) AS trades, SUM(usd_amount) AS volume
      FROM bot_trades
    )
    -- Allium loads both tables in block order (dex.trades in hourly batches, ~1-2.5h behind the chain),
    -- so rows just past the window end mean the window is complete
    SELECT t.trades, t.volume,
      EXISTS (SELECT 1 FROM solana.dex.trades
        WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.endTimestamp})
          AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp + 900}))
      AND EXISTS (SELECT 1 FROM solana.assets.transfers
        WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.endTimestamp})
          AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp + 900})) AS indexed
    FROM totals t
  `);
  if (!row) throw new Error(`No PepeBoost volume row for ${options.startTimestamp}-${options.endTimestamp}`);
  if (!row.indexed) throw new Error(`pepeboost: Allium has not indexed Solana past ${new Date(options.endTimestamp * 1e3).toISOString()} yet`);

  return { dailyVolume: Number(row.trades) > 0 ? row.volume : 0 };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  dependencies: [Dependencies.ALLIUM],
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2024-01-06',
  methodology: {
    Volume: 'USD volume of swaps executed through the PepeBoost trading bot on Solana, identified by the PepeBoost fee payment in the same transaction.',
  },
  isExpensiveAdapter: true,
  doublecounted: true,
};

export default adapter;
