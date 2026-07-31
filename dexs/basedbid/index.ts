import ADDRESSES from "../../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

// BasedBid bonding-curve launchpad program on Solana.
const SOLANA_PROGRAM = "CuodpYRDz4k87K6ZUFxk7X8JkVv5dNVZAcTQX2TEzTef";
// Hardcoded admin wallet receiving the protocol fee share — excluded so fees are not
// counted as trade principal.
const SOLANA_FEE_WALLET = "8umVV7k9HoVm4yy5DiRtKSH5qbKtw8xWDARGX8QiLfLe";
// Post-graduation DEX programs: transactions touching these are pool finalization or
// LP fee claims, not bonding-curve trades (that volume belongs to Raydium/Meteora).
const DEX_PROGRAMS = [
  "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C", // Raydium CPMM
  "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK", // Raydium CLMM
  "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG", // Meteora DAMM v2
  "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo", // Meteora DLMM
];
const BASE_MINTS = [
  ADDRESSES.solana.SOL,
  ADDRESSES.solana.USDC,
  "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB", // USD1
];

// A bonding-curve buy moves the trade principal from the trader to the pool account
// (plus smaller percentage fees to admin/sub-board/referrer wallets); a sell moves the
// principal from the pool back to the trader. Per transaction the largest base-token
// transfer that does not touch the admin fee wallet is the trade principal.
const fetchSolana = async (options: FetchOptions) => {
  const rows = await queryAllium(`
    WITH program_txs AS (
      SELECT txn_id
      FROM solana.raw.transactions
      WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND block_timestamp <  TO_TIMESTAMP_NTZ(${options.endTimestamp})
        AND success = true
        AND ARRAY_CONTAINS('${SOLANA_PROGRAM}'::VARIANT, TRANSFORM(account_keys, x -> x:pubkey))
        ${DEX_PROGRAMS.map((p) => `AND NOT ARRAY_CONTAINS('${p}'::VARIANT, TRANSFORM(account_keys, x -> x:pubkey))`).join("\n        ")}
    ),
    trade_amounts AS (
      SELECT tr.txn_id, MAX(tr.usd_amount) AS trade_usd
      FROM solana.assets.transfers tr
      JOIN program_txs p ON p.txn_id = tr.txn_id
      WHERE tr.block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND tr.block_timestamp <  TO_TIMESTAMP_NTZ(${options.endTimestamp})
        AND tr.mint IN (${BASE_MINTS.map((m) => `'${m}'`).join(", ")})
        AND tr.to_address != '${SOLANA_FEE_WALLET}'
        AND tr.from_address != '${SOLANA_FEE_WALLET}'
        AND tr.to_address != tr.from_address
      GROUP BY tr.txn_id
    )
    SELECT COALESCE(SUM(trade_usd), 0) AS daily_volume FROM trade_amounts
    `
  )

  return { dailyVolume: Number(rows[0].daily_volume) };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.SOLANA],
  start: "2025-12-24",
  fetch: fetchSolana,
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Volume:
      "Bonding-curve trade volume on BasedBid: per trade, the base-token (SOL/USDC/USD1) amount moved between the trader and the bonding-curve pool. Pool finalization and LP fee claims on Raydium/Meteora are excluded, as post-graduation trading volume belongs to those DEXs.",
  },
};

export default adapter;
