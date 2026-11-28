// DEEP (https://deepliquidity.fun): a Solana launchpad. Tokens launch on a bonding curve (the Deep
// Curve program) and trade there against their quote asset (SOL, or an approved token such as DEEP)
// until the curve is sold out; the liquidity then moves to a DeepSwap pool (the `deepswap` adapter).
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
import { base58Encode } from "../helpers/solana";
import { assertComplete, programEventsSql, timeFilter, u64, u8 } from "../helpers/alliumSolanaEvents";

const DEEP_CURVE_PROGRAM = "7czURwVLkQpcF1HVhhZU5GGzvPA8YniogZY1BhZHCDtA";

const FEE_VAULT = "8a2XakVBzdMRJ6gMY6u8mvebzJGgbmG6nVBVPB8uwBVZ";
export const FEE_VAULT_WSOL = "EcnANJ5kYr7a8LpiH4ETkSGD3r7SDdicUn9ttf5MWCir";
export const GRADUATION_PAYER = "GwW8P2V5mxfPosGEwtcNuUuzx6FVdzPZrapApn8ufYZF";

const EVENT = {
  Trade: "BDDB7FD34EE661EE",
  LaunchFeeCharged: "E2E3321153D20E95",
  Graduated: "33F142328CF59CC0",
  ReferralFee: "6F81BC899F4DA332",
};

const LABEL = {
  CurveProtocolFees: "Bonding Curve Trading Fees",
  CurveCreatorRewards: "Bonding Curve Creator Rewards",
  CurveHolderRewards: "Bonding Curve Holder Rewards",
  CurveReferralFees: "Bonding Curve Partner Referral Fees",
  LaunchFees: "Token Launch Fees",
  MigrationFees: "Migration Fees",
};

// Events end with the curve's quote mint; the default key, and older events without the field, mean native SOL
const SOL_QUOTE_HEX = "0".repeat(64);
const quoteMintSql = (column: string, offset: number) =>
  `IFF(LENGTH(${column}) >= ${2 * (offset + 32)}, SUBSTR(${column}, ${2 * offset + 1}, 64), '${SOL_QUOTE_HEX}')`;
const quoteToken = (quoteMintHex: string) =>
  quoteMintHex === SOL_QUOTE_HEX ? ADDRESSES.solana.SOL : base58Encode(Buffer.from(quoteMintHex, "hex"));

// System Program transfers of SOL to DEEP's fee vault or its wrapped SOL account (account-creation rent is a
// different type and is left out); a CTE to append after programEventsSql()
export const vaultTransfersSql = (options: FetchOptions) => `vault_transfers AS (
    SELECT txn_id, from_address, to_address, raw_amount
    FROM solana.assets.transfers
    WHERE ${timeFilter(options)} AND transfer_type = 'sol_transfer' AND type = 'transfer'
      AND to_address IN ('${FEE_VAULT}', '${FEE_VAULT_WSOL}')
  )`;

const fetch = async (options: FetchOptions) => {
  const rows = await queryAllium(`${programEventsSql(DEEP_CURVE_PROGRAM, options)},
  ${vaultTransfersSql(options)},
  trades AS (
    -- TradeEvent: is_buy u8 @72 | sol_amount u64 @73 | protocol_fee u64 @89 | creator_fee u64 @97 | holder_fee u64 @146 |
    -- quote_mint @154 (the amounts are in the quote asset's base units)
    SELECT ${quoteMintSql("data", 154)} AS quote_mint,
      ${u8("data", 72)} = '01' AS is_buy, ${u64("data", 73)} AS sol_amount, ${u64("data", 89)} AS protocol_fee,
      ${u64("data", 97)} AS creator_fee, ${u64("data", 146)} AS holder_fee
    FROM program_events
    WHERE STARTSWITH(data, '${EVENT.Trade}')
  ),
  referrals AS (
    -- ReferralFee: protocol_fee u64 @105 | amount u64 @113 (the approved partner's part of DEEP's fee) | quote_mint @121
    SELECT ${quoteMintSql("data", 121)} AS quote_mint, ${u64("data", 113)} AS amount
    FROM program_events
    WHERE STARTSWITH(data, '${EVENT.ReferralFee}')
  ),
  token_graduations AS (
    -- Graduated: migration_fee u64 @64 | quote_mint @80. A token-quoted curve's migration fee is booked whole:
    -- the SOL rent fund_graduation swaps out of it for the new pool is not netted.
    SELECT ${quoteMintSql("data", 80)} AS quote_mint, ${u64("data", 64)} AS migration_fee
    FROM program_events
    WHERE STARTSWITH(data, '${EVENT.Graduated}') AND ${quoteMintSql("data", 80)} != '${SOL_QUOTE_HEX}'
  ),
  per_quote AS (
    -- sol_amount is what the buyer paid, fees included, or what the seller received, fees already
    -- taken: the fees are added back so both sides are gross
    SELECT quote_mint,
      SUM(volume)::VARCHAR AS volume,
      SUM(protocol_fee)::VARCHAR AS protocol_fees,
      SUM(creator_fee)::VARCHAR AS creator_rewards,
      SUM(holder_fee)::VARCHAR AS holder_rewards,
      SUM(referral_fee)::VARCHAR AS referral_fees,
      SUM(migration_fee)::VARCHAR AS token_migration_fees
    FROM (
      SELECT quote_mint, IFF(is_buy, sol_amount, sol_amount + protocol_fee + creator_fee + holder_fee) AS volume,
        protocol_fee, creator_fee, holder_fee, 0 AS referral_fee, 0 AS migration_fee
      FROM trades
      UNION ALL
      SELECT quote_mint, 0, 0, 0, 0, amount, 0 FROM referrals
      UNION ALL
      SELECT quote_mint, 0, 0, 0, 0, 0, migration_fee FROM token_graduations
    )
    GROUP BY quote_mint
  ),
  totals AS (
    SELECT checks.*,
      -- LaunchFeeCharged: lamports u64 @74 (always SOL)
      (SELECT SUM(${u64("data", 74)}) FROM program_events WHERE STARTSWITH(data, '${EVENT.LaunchFeeCharged}'))::VARCHAR AS launch_fees,
      -- A SOL curve's migration fee (a share of the SOL it raised) first pays the network rent of the new pool's
      -- accounts; DEEP keeps what the graduation then sends to the fee vault, including the pool creation fee
      -- DeepSwap charges it.
      (SELECT SUM(raw_amount) FROM vault_transfers
        WHERE from_address = '${GRADUATION_PAYER}'
          AND txn_id IN (SELECT txn_id FROM program_events WHERE STARTSWITH(data, '${EVENT.Graduated}')))::VARCHAR AS migration_fees
    FROM checks
  )
  SELECT totals.*, per_quote.*
  FROM totals
  LEFT JOIN per_quote ON TRUE`);
  const [row] = rows;
  assertComplete(row, "deep-launchpad", options);

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const SOL = ADDRESSES.solana.SOL;

  // a sum over no rows is absent from the response: nothing of that kind happened in an indexed window
  for (const { quote_mint, volume, protocol_fees, creator_rewards, holder_rewards, referral_fees, token_migration_fees } of rows) {
    if (!quote_mint) continue;
    const token = quoteToken(quote_mint);
    const referral = BigInt(referral_fees ?? 0);
    const deepShare = BigInt(protocol_fees ?? 0) - referral;
    dailyVolume.add(token, volume ?? 0);
    dailyFees.add(token, deepShare, LABEL.CurveProtocolFees);
    dailyRevenue.add(token, deepShare, LABEL.CurveProtocolFees);
    dailyFees.add(token, referral, LABEL.CurveReferralFees);
    dailySupplySideRevenue.add(token, referral, LABEL.CurveReferralFees);
    dailyFees.add(token, creator_rewards ?? 0, LABEL.CurveCreatorRewards);
    dailySupplySideRevenue.add(token, creator_rewards ?? 0, LABEL.CurveCreatorRewards);
    dailyFees.add(token, holder_rewards ?? 0, LABEL.CurveHolderRewards);
    dailySupplySideRevenue.add(token, holder_rewards ?? 0, LABEL.CurveHolderRewards);
    dailyFees.add(token, token_migration_fees ?? 0, LABEL.MigrationFees);
    dailyRevenue.add(token, token_migration_fees ?? 0, LABEL.MigrationFees);
  }
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
  Volume: "What buyers paid and sellers were paid out on the bonding curves, before fees, in each curve's quote asset (SOL, or an approved token such as DEEP).",
  Fees: "Everything charged on the launchpad: the trading fee on each bonding-curve buy and sell (1.25%), the reward fee a token's creator chose at launch (0% to 5% of each trade), the fee to launch a token ($2, paid in SOL) and the migration fee taken from what a curve raised when its token graduates (1%; on a SOL curve less the network rent of the new pool's accounts). Trading and migration fees are in the curve's quote asset.",
  Revenue: "DEEP's share: its 1.25% fee on bonding-curve trades less the part paid to approved referral partners, the token launch fees and the migration fees. Reward fees are not included.",
  ProtocolRevenue: "DEEP's 1.25% fee on bonding-curve trades less the part paid to approved referral partners, the token launch fees and the migration fees, all paid into DEEP's on-chain fee vault.",
  SupplySideRevenue: "The reward fee of each token, paid in full to the token's creator or, for a Holder Rewards token, to the holders of that token, and the part of DEEP's fee paid to an approved referral partner named on a trade.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.CurveProtocolFees]: "DEEP's fee on each bonding-curve buy and sell (1.25%), less the part paid to referral partners.",
    [LABEL.CurveReferralFees]: "The part of DEEP's 1.25% fee paid to an approved referral partner named on the trade (no extra cost to the trader).",
    [LABEL.CurveCreatorRewards]: "The reward fee of Creator Rewards tokens (a rate the creator chose at launch, up to 5% of each trade).",
    [LABEL.CurveHolderRewards]: "The reward fee of Holder Rewards tokens (a rate the creator chose at launch, up to 5% of each trade).",
    [LABEL.LaunchFees]: "The fee to launch a token ($2, paid in SOL at the Pyth SOL/USD price).",
    [LABEL.MigrationFees]: "The part of what a curve raised that DEEP keeps when the token graduates to DeepSwap (1%; on a SOL curve less the network rent of the new pool's accounts).",
  },
  Revenue: {
    [LABEL.CurveProtocolFees]: "DEEP's fee on each bonding-curve buy and sell (1.25%), less the part paid to referral partners.",
    [LABEL.LaunchFees]: "The fee to launch a token.",
    [LABEL.MigrationFees]: "The migration fee DEEP keeps when a token graduates.",
  },
  ProtocolRevenue: {
    [LABEL.CurveProtocolFees]: "DEEP's fee on each bonding-curve buy and sell (1.25%), less the part paid to referral partners, paid into DEEP's fee vault.",
    [LABEL.LaunchFees]: "The fee to launch a token, paid into DEEP's fee vault.",
    [LABEL.MigrationFees]: "The migration fee DEEP keeps when a token graduates, paid into DEEP's fee vault.",
  },
  SupplySideRevenue: {
    [LABEL.CurveCreatorRewards]: "Reward fees paid to the creators of Creator Rewards tokens.",
    [LABEL.CurveHolderRewards]: "Reward fees paid to the holders of Holder Rewards tokens.",
    [LABEL.CurveReferralFees]: "The part of DEEP's fee paid to approved referral partners.",
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
