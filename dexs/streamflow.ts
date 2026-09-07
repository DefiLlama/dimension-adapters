import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";

// Streamflow (Solana): value of tokens delivered to vesting/airdrop recipients.
// Join each escrow-PDA outflow to its outer Anchor instruction and keep only
// delivery instructions by discriminator, so clawbacks (-> admin), cancel
// refunds (-> sender), escrow funding, and the protocol fee leg aren't counted.

const STREAMFLOW_PROGRAMS = [
  "strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m", // Stream (vesting / payments)
  "aSTRM2NKoKxNnkmLWk9sz3k74gKBk9t7bpPrTGxMszH", // Aligned Unlocks (token-launch vesting)
  "aMERKpFAWoChCi5oZwPvgsSCoGpZKBiU7fi76bdZjt2", // Aligned Distributor (airdrop)
  "MErKy6nZVoVAkryxAejJz2juifQ4ArgLgHmaJCQkU7N", // Distributor (airdrop)
];
// The two Aligned programs declare no withdraw/claim instruction of their own --
// their contracts settle through Stream and Distributor above. They stay listed
// so CPI-parented transfers still match on outer_program_id.

// delivery instructions, by Anchor discriminator
const DELIVERY_DISCRIMINATORS = [
  "b712469c946da122", // withdraw            (Stream)
  "4eb1627bd215bb53", // new_claim           (Distributor)
  "22ceb5170bcf935a", // claim_locked        (Distributor)
  "2c15afa1634c2cf9", // claim_locked_v2     (Distributor)
  "b585df75bc83f39e", // new_claim_by_worker (Distributor)
];

// treasury -- receives the protocol fee leg (0.19% vesting, 0.5% token lock)
// carried inside a withdraw. Only ~20% of withdrawals carry one: the token fee
// is refundable under the paid subscription plans.
const STREAMFLOW_TREASURY = "5SEpbdjFK5FxwTvfsGMXVQTD2v4M2c5tyRTxhdsPkgDw";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const programList = STREAMFLOW_PROGRAMS.map((p) => `'${p}'`).join(", ");
  const discList = DELIVERY_DISCRIMINATORS.map((d) => `'${d}'`).join(", ");

  const start = options.startTimestamp;
  const end = options.endTimestamp;
  const rows = await queryAllium(`
    WITH delivery_ix AS (
      SELECT txn_id, instruction_index
      FROM solana.raw.instructions
      WHERE program_id IN (${programList})
        AND data_hex_first16 IN (${discList})
        AND block_timestamp >= TO_TIMESTAMP_NTZ(${start}) AND block_timestamp < TO_TIMESTAMP_NTZ(${end})
    )
    SELECT
      t.mint,
      SUM(t.raw_amount) AS amount
    FROM solana.assets.transfers t
    JOIN delivery_ix d
      ON t.txn_id = d.txn_id AND t.instruction_index = d.instruction_index
    WHERE t.outer_program_id IN (${programList})
      AND t.transfer_type = 'spl_token_transfer'
      AND t.from_address != t.signer
      AND t.to_address != '${STREAMFLOW_TREASURY}'
      AND t.block_timestamp >= TO_TIMESTAMP_NTZ(${start}) AND t.block_timestamp < TO_TIMESTAMP_NTZ(${end})
    GROUP BY t.mint
  `);

  for (const row of rows) {
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
    Volume: "Value of SPL tokens delivered to recipients of Streamflow vesting streams and airdrops in the day window. Only recipient-delivery instructions (withdrawals and airdrop claims) are counted; escrow funding, cancellation refunds to the sender, airdrop clawbacks to the admin, and the protocol fee taken out of each withdrawal (0.19% on vesting, 0.5% on token locks) are excluded.",
  },
};

export default adapter;
