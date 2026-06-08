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

  // Two-layer filter for true recipient settlements:
  //   1. The SPL transfer must have been EMITTED by a Streamflow program IX
  //      (i.e. its parent in solana.instruction_calls has Streamflow as the
  //      executing_account). This excludes transfers batched into the same tx
  //      but unrelated to Streamflow -- the concern CodeRabbit raised on the
  //      previous tx_id-only filter.
  //   2. The source token account's owner must NOT be the tx signer. The
  //      sender signs Create/Deposit IXs AND is the from_owner of the
  //      deposit transfer (sender wallet -> escrow PDA), so deposits drop
  //      out. Withdraw/Cancel settlements have from_owner = escrow PDA, which
  //      is never the signer (whether the signer is the recipient self-
  //      claiming or a crank bot batching), so settlements pass through.
  // Caveat: in a Cancel IX, the unstreamed refund leg back to the sender is
  // also emitted by Streamflow with from_owner = PDA, so it gets counted
  // alongside the recipient settlement. Cancels are a minority of activity;
  // separating the legs would require IX-data discriminator decoding.
  const start = options.startTimestamp;
  const end = options.endTimestamp;
  const SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  const rows = await queryDuneSql(
    options,
    `
    WITH streamflow_emitted_transfers AS (
      SELECT tx_id, outer_instruction_index, inner_instruction_index
      FROM solana.instruction_calls
      WHERE executing_account = '${SPL_TOKEN_PROGRAM}'
        AND outer_executing_account IN (${programList})
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
        AND id IN (SELECT DISTINCT tx_id FROM streamflow_emitted_transfers)
    )
    SELECT
      tr.token_mint_address AS mint,
      SUM(tr.amount) AS amount
    FROM tokens_solana.transfers tr
    JOIN streamflow_emitted_transfers st
      ON tr.tx_id = st.tx_id
      AND tr.outer_instruction_index = st.outer_instruction_index
      AND tr.inner_instruction_index = st.inner_instruction_index
    JOIN signers s
      ON tr.tx_id = s.tx_id
    WHERE tr.from_owner != s.signer
      AND tr.block_time >= from_unixtime(${start})
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
      "Total value of SPL tokens delivered to recipients of Streamflow streams in the day window, summed across all four Streamflow Solana programs: Stream (vesting/payments), Aligned Unlocks (token-launch vesting), and the two airdrop distributors (Aligned Distributor + MerkleDistributor). Two-layer filter via Dune: (1) the SPL transfer must have been EMITTED by a Streamflow program IX (outer_executing_account IN streamflow_programs on solana.instruction_calls), which excludes any transfers batched into the same tx but unrelated to Streamflow settlement; (2) the source token account's owner must not be the tx signer, which excludes sender->escrow deposits (sender signs Create IXs and is the from_owner of the deposit transfer) while keeping all withdrawals regardless of who signs (recipient self-claims and crank-bot batch claims both have from_owner = escrow PDA != signer). Streams are pre-funded at creation, so the realized recipient settlements within the window equal the value-delivered. Data sources: solana.instruction_calls + solana.transactions + tokens_solana.transfers. USD-priced tokens only; many launch tokens streamed via Streamflow are not in DefiLlama's price index and therefore contribute zero to the headline figure. Minor over-count: the unstreamed-refund leg of Cancel IXs is also emitted by Streamflow with from_owner = PDA, so it gets counted alongside the recipient-settlement leg.",
  },
};

export default adapter;
