import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";

// Streamflow on Solana: token vesting + airdrop distribution. Volume is the
// value of tokens delivered to recipients across all Streamflow products --
// Stream (vesting/payments), Aligned Unlocks (token-launch vesting with
// aligned-to-market unlock curves), and the two airdrop distributors
// (MerkleDistributor and AlignedDistributor). The existing fees adapter at
// `fees/streamflow/index.ts` reads Streamflow's Metabase `revenue-daily`
// endpoint; there is no equivalent `claims-daily` endpoint, so for volume we
// go on-chain via Allium (solana.assets.transfers). Same data-source pattern
// as every other Solana volume adapter in the codebase.
//
// Streams are pre-funded: at creation the sender deposits the full notional
// amount into a per-stream escrow PDA owned by the Streamflow program, and
// recipients withdraw lazily via the `Withdraw` instruction. Cliffs apply to
// vesting products (Sablier-Lockup analog), and $-at-withdrawal is the
// economically real number for volatile project-token vesting -- which is
// what dominates Streamflow's Solana flow (JAM, RIV, RXT, WINGS launches
// mid-unlock). We sum the recipient-bound SPL token outflows from Streamflow
// PDAs in the window. This captures both Withdraw and cancel-time settlement
// (the cancel IX still routes the accrued-but-unwithdrawn portion to the
// recipient as an SPL transfer).

const STREAMFLOW_PROGRAMS = [
  "strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m", // Stream (vesting / payments)
  "aSTRM2NKoKxNnkmLWk9sz3k74gKBk9t7bpPrTGxMszH", // Aligned Unlocks (token-launch vesting)
  "aMERKpFAWoChCi5oZwPvgsSCoGpZKBiU7fi76bdZjt2", // Aligned Distributor (airdrop)
  "MErKy6nZVoVAkryxAejJz2juifQ4ArgLgHmaJCQkU7N", // Distributor (airdrop)
];

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const programList = STREAMFLOW_PROGRAMS.map((p) => `'${p}'`).join(", ");

  const start = options.startTimestamp;
  const end = options.endTimestamp;
  const rows = await queryAllium(`
    SELECT
      mint,
      SUM(raw_amount) AS amount
    FROM solana.assets.transfers
    WHERE outer_program_id IN (${programList})
      AND transfer_type = 'spl_token_transfer'
      AND from_address != signer
      AND block_timestamp >= TO_TIMESTAMP_NTZ(${start}) AND block_timestamp < TO_TIMESTAMP_NTZ(${end})
    GROUP BY mint
  `);

  for (const row of rows) {
    if (!row.mint || !row.amount) continue;
    dailyVolume.add(row.mint, row.amount);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2022-09-01",
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  pullHourly: true,
  methodology: {
    Volume: "Total value of SPL tokens delivered to recipients of Streamflow streams in the day window, summed across all four Streamflow Solana programs.",
  },
};

export default adapter;
