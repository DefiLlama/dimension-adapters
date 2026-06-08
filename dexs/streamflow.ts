import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// Streamflow on Solana: token vesting + airdrop distribution. Volume is the
// value of tokens delivered to recipients across all Streamflow products --
// Stream (vesting/payments), Aligned Unlocks (token-launch vesting with
// aligned-to-market unlock curves), and the two airdrop distributors
// (MerkleDistributor and AlignedDistributor). The existing fees adapter at
// `fees/streamflow/index.ts` reads Streamflow's Metabase `revenue-daily`
// endpoint; there is no equivalent `claims-daily` endpoint, so for volume we
// go on-chain via Dune. Same data-source pattern as every other Solana
// volume adapter in the codebase.
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

  // Sum recipient-bound SPL outflows from Streamflow program PDAs in the
  // window. The heuristic: for each tx invoking a Streamflow program, take
  // SPL transfers within that tx where `from_owner != tx_signer`. This
  // correctly excludes deposits (Create IX: sender signs and is the
  // from_owner of the token transfer into escrow -> same address, excluded)
  // while keeping every withdrawal regardless of who signs the tx (recipient
  // self-claims AND crank-bot-triggered batch claims both have signer !=
  // escrow PDA = from_owner). Small over-count: in a Cancel IX, the
  // unstreamed refund leg back to the sender is also from_owner=PDA, so it
  // gets counted alongside the recipient settlement. Cancels are a minority
  // of activity.
  const start = options.startTimestamp;
  const end = options.endTimestamp;
  const rows = await queryDuneSql(
    options,
    `
    WITH streamflow_txs AS (
      SELECT DISTINCT tx_id
      FROM solana.instruction_calls
      WHERE executing_account IN (${programList})
        AND tx_success = true
        AND block_time >= from_unixtime(${start})
        AND block_time <= from_unixtime(${end})
    ),
    signers AS (
      SELECT id AS tx_id, account_keys[1] AS signer
      FROM solana.transactions
      WHERE block_time >= from_unixtime(${start})
        AND block_time <= from_unixtime(${end})
        AND success = true
        AND id IN (SELECT tx_id FROM streamflow_txs)
    )
    SELECT
      tr.token_mint_address AS mint,
      SUM(tr.amount) AS amount
    FROM tokens_solana.transfers tr
    JOIN signers s
      ON tr.tx_id = s.tx_id
      AND tr.from_owner != s.signer
    WHERE tr.block_time >= from_unixtime(${start})
      AND tr.block_time <= from_unixtime(${end})
    GROUP BY tr.token_mint_address
  `
  );

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
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Volume:
      "Total value of SPL tokens delivered to recipients of Streamflow streams in the day window, summed across all four Streamflow Solana programs: Stream (vesting/payments), Aligned Unlocks (token-launch vesting), and the two airdrop distributors (Aligned Distributor + MerkleDistributor). For each transaction that invokes a Streamflow program, we sum SPL transfers within the tx whose source token account's owner is not the tx signer. The signer is the sender wallet on Create/Deposit IXs (so sender->escrow transfers are excluded), and is some other address (recipient or crank bot) on Withdraw/Cancel IXs (so escrow->recipient transfers are included). Streams are pre-funded at creation, so the time-integral of streamed value over a window equals the realized recipient settlements within that window. Data is sourced from Dune Analytics (solana.instruction_calls joined with solana.transactions for signer + tokens_solana.transfers for SPL movements). USD-priced tokens only; many launch tokens streamed via Streamflow are not in DefiLlama's price index and therefore contribute zero to the headline figure.",
  },
};

export default adapter;
