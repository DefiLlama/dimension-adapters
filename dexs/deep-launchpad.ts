// DEEP (https://deepliquidity.fun): a Solana launchpad. Tokens launch on a bonding curve (the Deep
// Curve program) and trade there against SOL until the curve is sold out; the liquidity then moves
// to a DeepSwap pool (the `deepswap` adapter).
// Docs: https://docs.deepliquidity.fun/docs
//
// Both programs report every trade in an Anchor event (a `Program data:` log line) with the fee of
// that trade already split by recipient, so volume and fees are the programs' own numbers: no rate
// is assumed. The events are read from the transactions' log messages on Allium.
// Event layouts and fee maths: https://github.com/Deep-Liquidity/deep-sdk (docs/INTEGRATORS.md,
// sections 5 and 7; the Anchor IDLs are in packages/sdk/idl).
import ADDRESSES from "../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";
import { assertComplete, programEventsSql, timeFilter, u64, u8 } from "../helpers/alliumSolanaEvents";

const DEEP_CURVE_PROGRAM = "7czURwVLkQpcF1HVhhZU5GGzvPA8YniogZY1BhZHCDtA";

const FEE_VAULT = "8a2XakVBzdMRJ6gMY6u8mvebzJGgbmG6nVBVPB8uwBVZ";
export const FEE_VAULT_WSOL = "EcnANJ5kYr7a8LpiH4ETkSGD3r7SDdicUn9ttf5MWCir";
export const GRADUATION_PAYER = "GwW8P2V5mxfPosGEwtcNuUuzx6FVdzPZrapApn8ufYZF";

const EVENT = {
  Trade: "BDDB7FD34EE661EE",
  LaunchFeeCharged: "E2E3321153D20E95",
  Graduated: "33F142328CF59CC0",
};

const LABEL = {
  CurveProtocolFees: "Bonding Curve Trading Fees",
  CurveCreatorRewards: "Bonding Curve Creator Rewards",
  CurveHolderRewards: "Bonding Curve Holder Rewards",
  LaunchFees: "Token Launch Fees",
  MigrationFees: "Migration Fees",
};

// System Program transfers of SOL to DEEP's fee vault or its wrapped SOL account (account-creation rent is a
// different type and is left out); a CTE to append after programEventsSql()
export const vaultTransfersSql = (options: FetchOptions) => `vault_transfers AS (
    SELECT txn_id, from_address, to_address, raw_amount
    FROM solana.assets.transfers
    WHERE ${timeFilter(options)} AND transfer_type = 'sol_transfer' AND type = 'transfer'
      AND to_address IN ('${FEE_VAULT}', '${FEE_VAULT_WSOL}')
  )`;

const fetch = async (options: FetchOptions) => {
  const [row] = await queryAllium(`${programEventsSql(DEEP_CURVE_PROGRAM, options)},
  ${vaultTransfersSql(options)},
  trades AS (
    -- TradeEvent: is_buy u8 @72 | sol_amount u64 @73 | protocol_fee u64 @89 | creator_fee u64 @97 | holder_fee u64 @146
    SELECT ${u8("data", 72)} = '01' AS is_buy, ${u64("data", 73)} AS sol_amount, ${u64("data", 89)} AS protocol_fee,
      ${u64("data", 97)} AS creator_fee, ${u64("data", 146)} AS holder_fee
    FROM program_events
    WHERE STARTSWITH(data, '${EVENT.Trade}')
  )
  SELECT
    -- sol_amount is what the buyer paid, fees included, or what the seller received, fees already
    -- taken: the fees are added back so both sides are gross
    (SELECT SUM(IFF(is_buy, sol_amount, sol_amount + protocol_fee + creator_fee + holder_fee)) FROM trades)::VARCHAR AS volume,
    (SELECT SUM(protocol_fee) FROM trades)::VARCHAR AS protocol_fees,
    (SELECT SUM(creator_fee) FROM trades)::VARCHAR AS creator_rewards,
    (SELECT SUM(holder_fee) FROM trades)::VARCHAR AS holder_rewards,
    -- LaunchFeeCharged: lamports u64 @74
    (SELECT SUM(${u64("data", 74)}) FROM program_events WHERE STARTSWITH(data, '${EVENT.LaunchFeeCharged}'))::VARCHAR AS launch_fees,
    -- The migration fee (a share of the SOL the curve raised) first pays the network rent of the new
    -- pool's accounts; DEEP keeps what the graduation then sends to the fee vault, including the pool
    -- creation fee DeepSwap charges it.
    (SELECT SUM(raw_amount) FROM vault_transfers
      WHERE from_address = '${GRADUATION_PAYER}'
        AND txn_id IN (SELECT txn_id FROM program_events WHERE STARTSWITH(data, '${EVENT.Graduated}')))::VARCHAR AS migration_fees,
    checks.*
  FROM checks`);
  assertComplete(row, "deep-launchpad", options);

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const SOL = ADDRESSES.solana.SOL;

  // a sum over no rows is absent from the response: nothing of that kind happened in an indexed window
  dailyVolume.add(SOL, row.volume ?? 0);
  dailyFees.add(SOL, row.protocol_fees ?? 0, LABEL.CurveProtocolFees);
  dailyRevenue.add(SOL, row.protocol_fees ?? 0, LABEL.CurveProtocolFees);
  dailyFees.add(SOL, row.creator_rewards ?? 0, LABEL.CurveCreatorRewards);
  dailySupplySideRevenue.add(SOL, row.creator_rewards ?? 0, LABEL.CurveCreatorRewards);
  dailyFees.add(SOL, row.holder_rewards ?? 0, LABEL.CurveHolderRewards);
  dailySupplySideRevenue.add(SOL, row.holder_rewards ?? 0, LABEL.CurveHolderRewards);
  dailyFees.add(SOL, row.launch_fees ?? 0, LABEL.LaunchFees);
  dailyRevenue.add(SOL, row.launch_fees ?? 0, LABEL.LaunchFees);
  dailyFees.add(SOL, row.migration_fees ?? 0, LABEL.MigrationFees);
  dailyRevenue.add(SOL, row.migration_fees ?? 0, LABEL.MigrationFees);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "SOL paid by buyers and SOL paid out to sellers on the bonding curves, before fees.",
  Fees: "Everything charged on the launchpad: DEEP's fee on each bonding-curve buy and sell (1.25%), the reward fee a token's creator chose at launch (0% to 5% of each trade), the fee to launch a token ($2, paid in SOL) and the migration fee taken from the SOL a curve raised when its token graduates (1%, less the network rent of the new pool's accounts).",
  Revenue: "DEEP's share: its 1.25% fee on bonding-curve trades, the token launch fees and the migration fees. Reward fees are not included.",
  ProtocolRevenue: "DEEP's 1.25% fee on bonding-curve trades, the token launch fees and the migration fees, all paid into DEEP's on-chain fee vault, which pays 10% to the team that builds DEEP and 90% to the DEEP treasury.",
  SupplySideRevenue: "The reward fee of each token, paid in full to the token's creator or, for a Holder Rewards token, to the holders of that token.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.CurveProtocolFees]: "DEEP's fee on each bonding-curve buy and sell (1.25%).",
    [LABEL.CurveCreatorRewards]: "The reward fee of Creator Rewards tokens (a rate the creator chose at launch, up to 5% of each trade).",
    [LABEL.CurveHolderRewards]: "The reward fee of Holder Rewards tokens (a rate the creator chose at launch, up to 5% of each trade).",
    [LABEL.LaunchFees]: "The fee to launch a token ($2, paid in SOL at the Pyth SOL/USD price).",
    [LABEL.MigrationFees]: "The part of the SOL a curve raised that DEEP keeps when the token graduates to DeepSwap (1%, less the network rent of the new pool's accounts).",
  },
  Revenue: {
    [LABEL.CurveProtocolFees]: "DEEP's fee on each bonding-curve buy and sell (1.25%).",
    [LABEL.LaunchFees]: "The fee to launch a token.",
    [LABEL.MigrationFees]: "The migration fee DEEP keeps when a token graduates.",
  },
  ProtocolRevenue: {
    [LABEL.CurveProtocolFees]: "DEEP's fee on each bonding-curve buy and sell (1.25%), paid into DEEP's fee vault.",
    [LABEL.LaunchFees]: "The fee to launch a token, paid into DEEP's fee vault.",
    [LABEL.MigrationFees]: "The migration fee DEEP keeps when a token graduates, paid into DEEP's fee vault.",
  },
  SupplySideRevenue: {
    [LABEL.CurveCreatorRewards]: "Reward fees paid to the creators of Creator Rewards tokens.",
    [LABEL.CurveHolderRewards]: "Reward fees paid to the holders of Holder Rewards tokens.",
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
