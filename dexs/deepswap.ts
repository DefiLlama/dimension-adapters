// DeepSwap: DEEP's constant-product AMM (https://deepliquidity.fun), a fork of Raydium cp-swap.
// Tokens that graduate from the DEEP launchpad (the `deep-launchpad` adapter) trade here, and anyone
// can open a pool for any other pair.
// Docs: https://docs.deepliquidity.fun/docs
//
// Each swap reports its fee split by recipient in the program's own events, so no rate is assumed.
// The events are read from the transactions' log messages on Allium (see dexs/deep-launchpad.ts).
// Event layouts: https://github.com/Deep-Liquidity/deep-sdk (docs/INTEGRATORS.md, section 5).
import ADDRESSES from "../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";
import { METRIC } from "../helpers/metrics";
import { base58Encode } from "../helpers/solana";
import { assertComplete, FEE_VAULT_WSOL, GRADUATION_PAYER, programEventsSql, u64, u8 } from "./deep-launchpad";

const DEEP_AMM_PROGRAM = "HCrCy6bzHhZ1b6bXwQAucEFkKXyzYMh3hgAR8UPrYSEP";

const EVENT = {
  Swap: "40C6CDE8260871E2",
  SwapFeesV1: "C7030BBC2479CFC0",
};

const REWARD_MODEL_HOLDER = "02";

const LABEL = {
  SwapProtocolFees: METRIC.PROTOCOL_FEES,
  SwapLpFees: METRIC.LP_FEES,
  SwapCreatorRewards: "Creator Rewards",
  SwapHolderRewards: "Holder Rewards",
  PoolCreationFees: "Pool Creation Fees",
};

const fetch = async (options: FetchOptions) => {
  const rows = await queryAllium(`${programEventsSql(DEEP_AMM_PROGRAM, options)},
  swaps AS (
    -- a swap emits one SwapEvent and one SwapFeesV1 from the same call
    SELECT s.data AS swap, f.data AS fees
    FROM program_events s
    LEFT JOIN program_events f ON f.txn_id = s.txn_id AND f.frame = s.frame AND STARTSWITH(f.data, '${EVENT.SwapFeesV1}')
    WHERE STARTSWITH(s.data, '${EVENT.Swap}')
  ),
  swap_fees AS (
    -- SwapEvent: pool_id @8 | input_amount u64 @56 | output_amount u64 @64
    -- SwapFeesV1: pool_id @8 | is_buy u8 @40 | quote_mint @41 | lp_fee u64 @73 | protocol_fee u64 @81 | reward_fee u64 @89 | reward_model u8 @97
    SELECT SUBSTR(fees, 83, 64) AS quote_mint, ${u8("fees", 40)} = '01' AS is_buy,
      ${u64("swap", 56)} AS input_amount, ${u64("swap", 64)} AS output_amount,
      ${u64("fees", 73)} AS lp_fee, ${u64("fees", 81)} AS protocol_fee, ${u64("fees", 89)} AS reward_fee,
      ${u8("fees", 97)} = '${REWARD_MODEL_HOLDER}' AS to_holders
    FROM swaps
    WHERE SUBSTR(swap, 17, 64) = SUBSTR(fees, 17, 64)
  ),
  swap_totals AS (
    -- A pool charges all its fees in its quote token (SOL on a TOKEN/SOL pool): on the input of a buy,
    -- on the output of a sell. Volume is the quote side before fees: a buy's input is what the trader
    -- sent, a sell's output is what the trader received after the fees were taken from it.
    SELECT quote_mint,
      SUM(IFF(is_buy, input_amount, output_amount + lp_fee + protocol_fee + reward_fee))::VARCHAR AS volume,
      SUM(protocol_fee)::VARCHAR AS protocol_fees,
      SUM(lp_fee)::VARCHAR AS lp_fees,
      SUM(IFF(to_holders, 0, reward_fee))::VARCHAR AS creator_rewards,
      SUM(IFF(to_holders, reward_fee, 0))::VARCHAR AS holder_rewards
    FROM swap_fees
    GROUP BY quote_mint
  ),
  totals AS (
    SELECT checks.*,
      (SELECT COUNT(*) FROM swaps WHERE fees IS NULL OR SUBSTR(swap, 17, 64) != SUBSTR(fees, 17, 64)) AS unpaired_swaps,
      -- Opening a pool costs a flat fee in SOL, which DeepSwap transfers to the fee vault's wrapped SOL
      -- account, the only payment to that account in a DeepSwap transaction. The pool of a graduating
      -- token is paid for out of its migration fee, which the launchpad adapter reports.
      (SELECT SUM(raw_amount) FROM vault_transfers
        WHERE to_address = '${FEE_VAULT_WSOL}' AND from_address != '${GRADUATION_PAYER}'
          AND txn_id IN (SELECT txn_id FROM program_txs))::VARCHAR AS pool_creation_fees
    FROM checks
  )
  SELECT totals.*, swap_totals.*
  FROM totals
  LEFT JOIN swap_totals ON TRUE`);
  const [row] = rows;
  assertComplete(row, "deepswap", options);

  if (Number(row.unpaired_swaps) > 0)
    throw new Error(`deepswap: ${row.unpaired_swaps} swaps without a SwapFeesV1 event of the same pool`);

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const { quote_mint, volume, protocol_fees, lp_fees, creator_rewards, holder_rewards } of rows) {
    if (!quote_mint) continue;
    const token = base58Encode(Buffer.from(quote_mint, "hex"));
    dailyVolume.add(token, volume);
    dailyFees.add(token, protocol_fees, LABEL.SwapProtocolFees);
    dailyRevenue.add(token, protocol_fees, LABEL.SwapProtocolFees);
    dailyFees.add(token, lp_fees, LABEL.SwapLpFees);
    dailySupplySideRevenue.add(token, lp_fees, LABEL.SwapLpFees);
    dailyFees.add(token, creator_rewards, LABEL.SwapCreatorRewards);
    dailySupplySideRevenue.add(token, creator_rewards, LABEL.SwapCreatorRewards);
    dailyFees.add(token, holder_rewards, LABEL.SwapHolderRewards);
    dailySupplySideRevenue.add(token, holder_rewards, LABEL.SwapHolderRewards);
  }
  dailyFees.add(ADDRESSES.solana.SOL, row.pool_creation_fees ?? 0, LABEL.PoolCreationFees);
  dailyRevenue.add(ADDRESSES.solana.SOL, row.pool_creation_fees ?? 0, LABEL.PoolCreationFees);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "The quote-token side (SOL on a TOKEN/SOL pool) of every swap, before fees.",
  Fees: "Everything charged on DeepSwap: the swap fee (0.35% of a buy and 0.75% of a sell), the reward fee the pool charges on top of it (0% to 5%, fixed when the pool was created) and the flat fee in SOL to open a pool. Pools of graduated launchpad tokens are opened by the launchpad, which pays that fee out of the token's migration fee; it is reported with the launchpad, not here.",
  Revenue: "DEEP's share of the swap fee (0.25% of a buy, 0.65% of a sell) and the pool creation fees.",
  ProtocolRevenue: "DEEP's share of the swap fee (0.25% of a buy, 0.65% of a sell) and the pool creation fees, all paid into DEEP's on-chain fee vault, which pays 10% to the team that builds DEEP and 90% to the DEEP treasury.",
  SupplySideRevenue: "The liquidity providers' share of the swap fee (0.10% of each swap, left in the pool) and each pool's reward fee, paid in full to the pool's creator or, on a Holder Rewards pool, to the holders of the pool's token.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.SwapProtocolFees]: "DEEP's share of the swap fee (0.25% of a buy, 0.65% of a sell).",
    [LABEL.SwapLpFees]: "The liquidity providers' share of the swap fee (0.10% of each swap).",
    [LABEL.SwapCreatorRewards]: "The reward fee of Creator Rewards pools (a rate fixed when the pool was created, up to 5% of each swap).",
    [LABEL.SwapHolderRewards]: "The reward fee of Holder Rewards pools (a rate fixed when the pool was created, up to 5% of each swap).",
    [LABEL.PoolCreationFees]: "The flat fee in SOL to open a pool, except pools opened by the DEEP launchpad for graduated tokens.",
  },
  Revenue: {
    [LABEL.SwapProtocolFees]: "DEEP's share of the swap fee (0.25% of a buy, 0.65% of a sell).",
    [LABEL.PoolCreationFees]: "The flat fee in SOL to open a pool.",
  },
  ProtocolRevenue: {
    [LABEL.SwapProtocolFees]: "DEEP's share of the swap fee, paid into DEEP's fee vault.",
    [LABEL.PoolCreationFees]: "The flat fee in SOL to open a pool, paid into DEEP's fee vault.",
  },
  SupplySideRevenue: {
    [LABEL.SwapLpFees]: "The liquidity providers' share of the swap fee, left in the pool.",
    [LABEL.SwapCreatorRewards]: "Reward fees paid to the creators of Creator Rewards pools.",
    [LABEL.SwapHolderRewards]: "Reward fees paid to the holders of the token of Holder Rewards pools.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-10-08",
  dependencies: [Dependencies.ALLIUM],
  methodology,
  breakdownMethodology,
};

export default adapter;
