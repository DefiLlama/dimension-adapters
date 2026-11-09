import { Dependencies, type FetchOptions, type SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";

const RHIVA_ZAP_PROGRAM = "RH1NLqLxRAUxTq3L1SBS1ED78o1fHxQqRwnBQYVsYub";
const SWAP = "f8c69e91e17587c8";
const PAYER_ACCOUNT = 10;
const PROGRAM_DEPLOYED = Date.UTC(2026, 8, 9) / 1e3;

const fetch = async (options: FetchOptions) => {
  const start = options.startOfDay;
  const end = start + 86400;
  const swaps = (table: string) => `
    SELECT block_timestamp, accounts[${PAYER_ACCOUNT}]::STRING AS wallet
    FROM ${table}
    WHERE program_id = '${RHIVA_ZAP_PROGRAM}' AND data_hex_first16 = '${SWAP}' AND parent_tx_success
      AND block_timestamp >= TO_TIMESTAMP_NTZ(${PROGRAM_DEPLOYED}) AND block_timestamp < TO_TIMESTAMP_NTZ(${end})`;
  const [row] = await queryAllium(`
    WITH first_swaps AS (
      SELECT wallet, MIN(block_timestamp) AS first_swap
      FROM (${swaps("solana.raw.instructions")} UNION ALL ${swaps("solana.raw.inner_instructions")})
      GROUP BY wallet
    )
    SELECT
      COUNT_IF(wallet IS NOT NULL AND first_swap >= TO_TIMESTAMP_NTZ(${start})) AS new_users,
      COUNT_IF(wallet IS NULL) AS missing_payer,
      (SELECT MAX(block_timestamp) >= TO_TIMESTAMP_NTZ(${end}) FROM solana.raw.instructions
        WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${end - 600}) AND block_timestamp < TO_TIMESTAMP_NTZ(${end + 600})) AS indexed
    FROM first_swaps`);
  if (!row?.indexed) throw new Error(`rhiva: Allium has not indexed Solana past ${new Date(end * 1e3).toISOString()} yet`);
  if (Number(row.missing_payer) > 0) throw new Error("rhiva: a zap swap has no payer account, the swap layout changed");

  return { dailyNewUsers: Number(row.new_users) };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-09-10",
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    NewUsers: "Wallets that swapped through Rhiva's zap program for the first time that day. Excludes app sign-ups that never made a zap swap.",
  },
};

export default adapter;
