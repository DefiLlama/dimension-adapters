import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

// Cube DEX pool program (Solana mainnet). The on-chain Rust module is
// named `cubic_pool` (legacy name from before the protocol rebrand to Cube).
const PROGRAM_ID = "8iQtGj9mcUfFUGaiCpPy89swC3s8YTC8FhVZWfgeZhwu";

// Anchor instruction discriminator for `swap` (first 8 bytes of the
// instruction data). Source: contracts/idl/cubic_pool.json
const SWAP_DISCRIMINATOR_HEX = "f8c69e91e17587c8";

// Anchor `swap` instruction layout:
//   data[1..=8]   = discriminator
//   data[9..=16]  = amount_in (u64, little-endian)
//   data[17..=24] = minimum_amount_out (u64, le)  — unused here
//   data[25]      = token_in_index (u8)            — unused here
//   data[26]      = token_out_index (u8)           — unused here
//
// account_arguments (1-indexed in Trino):
//   [1] pool
//   [2] token_mint_in   ← used to attribute volume to a token
//   [3] token_mint_out
//   [4] user_token_account_in
//   [5] user_token_account_out
//   [6] vault_in
//   [7] vault_out
//   [8] user
//   [9] token_program_in
//  [10] token_program_out

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const rows = await queryDuneSql(
    options,
    `WITH cube_swaps AS (
      SELECT
        bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 9, 8))) AS amount_in,
        account_arguments[2] AS token_mint_in
      FROM solana.instruction_calls
      WHERE executing_account = '${PROGRAM_ID}'
        AND bytearray_substring(data, 1, 8) = from_hex('${SWAP_DISCRIMINATOR_HEX}')
        AND block_time >= from_unixtime(${options.startTimestamp})
        AND block_time < from_unixtime(${options.endTimestamp})
        AND tx_success = true
    )
    SELECT
      token_mint_in,
      SUM(amount_in) AS total_amount
    FROM cube_swaps
    WHERE amount_in > 0
    GROUP BY token_mint_in`
  );

  for (const row of rows) {
    dailyVolume.add(row.token_mint_in, row.total_amount);
  }

  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  chains: [CHAIN.SOLANA],
  fetch,
  start: "2026-05-01",
  isExpensiveAdapter: true,
  methodology: {
    Volume:
      "Sum of `amount_in` parsed directly from on-chain Cube `swap` instructions on Solana, attributed to the input token mint. Computed via Dune SQL over `solana.instruction_calls` filtered by program id and the swap-instruction discriminator.",
  },
};

export default adapter;