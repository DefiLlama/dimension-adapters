/**
 * FusedPad (https://fusedpad.com) — Solana memecoin launchpad on Meteora Dynamic
 * Bonding Curve (dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN) and, after a coin
 * graduates, Meteora DAMM v2.
 *
 * WHAT IDENTIFIES FUSEDPAD ON CHAIN
 *
 * FusedPad creates one DBC partner config per quote asset (SOL, USDC, USDT, …).
 * Every config sets the same fee_claimer: the fused_fee Global PDA
 * F3swKL7FKLtNfo9ckummnkrjnoQna2UCGzAErx5VBcLU (owned by program
 * AZY2uXFPUfgTkhoNaXNL3oaZMdb4r3NfHYymA3s4mMw9). fee_claimer is fixed at config
 * creation and cannot change, so it is the ownership key. Coin-create
 * transactions are signed by each visitor's own wallet, so call_tx_signer /
 * account_creator are not usable (same reason as fees/user-fun.ts and
 * fees/vaultex.ts).
 *
 * FEE WATERFALL (1.50% of the quote side of every trade; verified on live
 * configs, e.g. Fdz9izTjXKicQiosBcQCFgv31mcthJcBhDb6qhERbrbN, cliff fee
 * numerator 15_000_000 / 1e9 = 1.5%, creator_trading_fee_percentage = 8)
 *
 *   0.30%  Meteora protocol share (20% of the gross fee). EvtSwap2 reports it as
 *          protocol_fee plus the referral_fee leg handed to a hosting frontend.
 *   1.20%  trading_fee, split by creator_trading_fee_percentage (8):
 *            0.096%  coin creator  (8% of 1.20%)
 *            1.104%  FusedPad partner share (the remainder), which fused_fee
 *                    then splits 90/110 to holders of the pair token and
 *                    20/110 to the $FUSED burn pot:
 *                      0.90%  holder distributions (paid in the quote token;
 *                             supply-side — pair token holders, not $FUSED)
 *                      0.20%  $FUSED buy-and-burn (holders revenue)
 *                    After $FUSED itself graduates and set_auto_lp is called,
 *                    that 0.20% burn pot further splits by lp_share_bps
 *                    (default 5000 = half): 0.10% burn + 0.10% permanently
 *                    locked $FUSED/SOL LP. Until then AUTO_LP_ENABLED_FROM is
 *                    0 and the locked-LP label stays at zero.
 *
 * SCOPE
 *
 * Bonding-curve swaps (EvtSwap2) on every config whose fee_claimer is Global,
 * plus post-migration DAMM v2 swaps on pools that migrated from those configs.
 * doublecounted with the Meteora adapters that also see these pools.
 *
 * Sources: https://github.com/FusedPad/fused-fee (HOLDER_NUM=90, BURN_NUM=20,
 * SPLIT_DENOM=110, DEFAULT_AUTO_LP_BPS=5000; CREATOR_SHARE 8/100 on graduated
 * claims). Website https://fusedpad.com ; X https://x.com/FusedPad
 */

import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { assertDuneSolanaIndexed } from "../../helpers/duneSolanaDex";
import { METRIC } from "../../helpers/metrics";

const DBC_PROGRAM = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";
// fused_fee Global PDA — fee_claimer on every FusedPad DBC config
const FEE_CLAIMER = "F3swKL7FKLtNfo9ckummnkrjnoQna2UCGzAErx5VBcLU";
// creator_trading_fee_percentage on live FusedPad configs (on-chain)
const CREATOR_PCT_FALLBACK = 8;
// Partner-share split inside fused_fee (of the 1.104% partner cut)
const HOLDER_NUM = 90;
const BURN_NUM = 20;
const SPLIT_DENOM = 110; // HOLDER_NUM + BURN_NUM
// Flip to the unix second of the day set_auto_lp lands on mainnet. 0 = off
// (today): all of the 0.20% burn pot is buy-and-burn; locked-LP stays 0.
const AUTO_LP_ENABLED_FROM = 0;
// Default on-chain lp_share_bps once auto-LP is enabled (half of the burn pot)
const AUTO_LP_BPS = 5_000;
// Day the first FusedPad config (CzaGq…, $FUSED pool) was created on mainnet
const START = "2026-10-10";

const LABELS = {
  Holders: "Holder Distributions",
  Burn: METRIC.TOKEN_BUY_BACK,
  LockedLp: "Locked $FUSED Liquidity",
  Creators: METRIC.CREATOR_FEES,
  Meteora: "Protocol Fees to Meteora",
  Referral: "Referral Fees",
  CompoundedLp: "Compounded LP Fees",
  LpFees: "DAMM LP Fees",
};

type Row = {
  quote_mint: string;
  partner_fee: string | number;
  creator_fee: string | number;
  protocol_fee: string | number;
  referral_fee: string | number;
  lp_fee?: string | number;
  compounding_fee?: string | number;
};

/**
 * Split one partner-share amount (already net of the creator cut) into holders,
 * $FUSED buy-and-burn, and (once auto-LP is on) locked $FUSED LP. Mirrors
 * fused_fee: holders = floor(x * 90/110), burn pot = remainder; of the burn pot,
 * lp = floor(burn * AUTO_LP_BPS/10000) when enabled.
 */
export const splitPartnerShare = (
  partnerFee: number,
  atTimestamp: number,
): { holders: number; burn: number; lockedLp: number } => {
  const holders = Math.floor((partnerFee * HOLDER_NUM) / SPLIT_DENOM);
  const burnPot = partnerFee - holders;
  if (AUTO_LP_ENABLED_FROM > 0 && atTimestamp >= AUTO_LP_ENABLED_FROM) {
    const lockedLp = Math.floor((burnPot * AUTO_LP_BPS) / 10_000);
    return { holders, burn: burnPot - lockedLp, lockedLp };
  }
  return { holders, burn: burnPot, lockedLp: 0 };
};

const fetch = async (options: FetchOptions) => {
  assertDuneSolanaIndexed(options);

  const rows: Row[] = await queryDuneSql(
    options,
    `
    WITH
      fused_configs AS (
        SELECT
          config,
          MIN(quote_mint) AS quote_mint,
          COALESCE(
            MIN(CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.creator_trading_fee_percentage') AS INTEGER)),
            MIN(CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.ConfigParameters.creator_trading_fee_percentage') AS INTEGER)),
            ${CREATOR_PCT_FALLBACK}
          ) AS creator_pct,
          -- 1 = creator has some DAMM LP (locked/unlocked/vested); 0 = none / unknown.
          -- Mirrors fused_fee creator_has_lp(). Prefer explicit migration LP fields when Dune has them.
          MAX(
            CASE
              WHEN COALESCE(
                CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.creator_permanent_locked_liquidity_percentage') AS INTEGER),
                CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.ConfigParameters.creator_permanent_locked_liquidity_percentage') AS INTEGER),
                CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.creator_lp_percentage') AS INTEGER),
                CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.ConfigParameters.creator_lp_percentage') AS INTEGER),
                CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.locked_vesting_params.amount_per_period') AS INTEGER),
                CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.ConfigParameters.locked_vesting_params.amount_per_period') AS INTEGER),
                0
              ) > 0 THEN 1
              ELSE 0
            END
          ) AS creator_has_lp
        FROM (
          SELECT config, quote_mint, config_parameters
          FROM meteora_solana.dynamic_bonding_curve_evt_evtcreateconfig
          WHERE fee_claimer = '${FEE_CLAIMER}'
          UNION
          SELECT config, quote_mint, config_parameters
          FROM meteora_solana.dynamic_bonding_curve_evt_evtcreateconfigv2
          WHERE fee_claimer = '${FEE_CLAIMER}'
        ) c
        GROUP BY config
      ),
      -- EvtSwap2 alone holds every DBC trade exactly once (legacy swap emits
      -- EvtSwap + EvtSwap2; swap2 emits only EvtSwap2). Same rule as fees/vaultex.ts.
      dbc_swaps AS (
        SELECT
          s.config,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult2.trading_fee') AS DECIMAL(38,0)) AS trading_fee,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult2.protocol_fee') AS DECIMAL(38,0)) AS protocol_fee,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult2.referral_fee') AS DECIMAL(38,0)) AS referral_fee
        FROM meteora_solana.dynamic_bonding_curve_evt_evtswap2 s
        WHERE s.config IN (SELECT config FROM fused_configs)
          AND s.evt_executing_account = '${DBC_PROGRAM}'
          AND s.evt_block_date >= CAST(from_unixtime(${options.startTimestamp}) AS DATE)
          AND s.evt_block_date <= CAST(from_unixtime(${options.endTimestamp}) AS DATE)
          AND s.evt_block_time >= from_unixtime(${options.startTimestamp})
          AND s.evt_block_time <  from_unixtime(${options.endTimestamp})
      ),
      dbc AS (
        SELECT
          c.quote_mint,
          SUM(
            COALESCE(s.trading_fee, 0)
            - FLOOR(COALESCE(s.trading_fee, 0) * c.creator_pct / 100)
          ) AS partner_fee,
          SUM(FLOOR(COALESCE(s.trading_fee, 0) * c.creator_pct / 100)) AS creator_fee,
          SUM(COALESCE(s.protocol_fee, 0)) AS protocol_fee,
          SUM(COALESCE(s.referral_fee, 0)) AS referral_fee
        FROM dbc_swaps s
        JOIN fused_configs c ON c.config = s.config
        GROUP BY c.quote_mint
      ),
      migrated AS (
        SELECT
          m.account_pool AS pool,
          COALESCE(m.account_quote_mint, c.quote_mint) AS quote_mint,
          c.creator_pct,
          c.creator_has_lp
        FROM meteora_solana.dynamic_bonding_curve_call_migration_damm_v2 m
        JOIN fused_configs c ON c.config = m.account_config
      ),
      -- DAMM v2 after Meteora cp-amm 0.2.0: partner_fee removed; trading fee =
      -- claiming_fee + compounding_fee. Pre-0.2.0 rows still have partner_fee and a
      -- separate trading_fee/lp_fee (same split fees/trends.ts uses).
      -- position_fee = partner_fee (old) or claiming_fee (new) — what Global's fee
      -- position / claimable LP accrues; fused_fee claims this via crank_claim_damm.
      -- lp_fee = pre-0.2.0 trading_fee/lp_fee only (not COALESCE'd into position_fee,
      -- or partner + LP would collapse to one leg and understate gross Fees).
      -- compounding_fee = post-0.2.0 reserve-reinvested LP share.
      -- Creator cut mirrors crank_claim_damm: only when creator_has_lp == 0.
      damm_swaps AS (
        SELECT
          m.quote_mint,
          m.creator_pct,
          m.creator_has_lp,
          COALESCE(
            CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult2.partner_fee') AS DECIMAL(38,0)),
            CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult2.claiming_fee') AS DECIMAL(38,0)),
            CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.partner_fee') AS DECIMAL(38,0)),
            0
          ) AS position_fee,
          COALESCE(
            CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult2.trading_fee') AS DECIMAL(38,0)),
            CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.lp_fee') AS DECIMAL(38,0)),
            0
          ) AS lp_fee,
          COALESCE(
            CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult2.compounding_fee') AS DECIMAL(38,0)),
            0
          ) AS compounding_fee,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult2.protocol_fee') AS DECIMAL(38,0)) AS protocol_fee,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult2.referral_fee') AS DECIMAL(38,0)) AS referral_fee
        FROM meteora_solana.cp_amm_evt_evtswap2 s
        JOIN migrated m ON s.pool = m.pool
        WHERE s.evt_block_date >= CAST(from_unixtime(${options.startTimestamp}) AS DATE)
          AND s.evt_block_date <= CAST(from_unixtime(${options.endTimestamp}) AS DATE)
          AND s.evt_block_time >= from_unixtime(${options.startTimestamp})
          AND s.evt_block_time <  from_unixtime(${options.endTimestamp})
      ),
      damm AS (
        SELECT
          quote_mint,
          SUM(
            CASE
              WHEN creator_has_lp = 1 THEN COALESCE(position_fee, 0)
              ELSE COALESCE(position_fee, 0)
                - FLOOR(COALESCE(position_fee, 0) * creator_pct / 100)
            END
          ) AS partner_fee,
          SUM(
            CASE
              WHEN creator_has_lp = 1 THEN CAST(0 AS DECIMAL(38,0))
              ELSE FLOOR(COALESCE(position_fee, 0) * creator_pct / 100)
            END
          ) AS creator_fee,
          SUM(COALESCE(protocol_fee, 0)) AS protocol_fee,
          SUM(COALESCE(referral_fee, 0)) AS referral_fee,
          SUM(COALESCE(lp_fee, 0)) AS lp_fee,
          SUM(COALESCE(compounding_fee, 0)) AS compounding_fee
        FROM damm_swaps
        GROUP BY quote_mint
      )
    SELECT quote_mint,
      CAST(SUM(partner_fee) AS VARCHAR) AS partner_fee,
      CAST(SUM(creator_fee) AS VARCHAR) AS creator_fee,
      CAST(SUM(protocol_fee) AS VARCHAR) AS protocol_fee,
      CAST(SUM(referral_fee) AS VARCHAR) AS referral_fee,
      CAST(SUM(lp_fee) AS VARCHAR) AS lp_fee,
      CAST(SUM(compounding_fee) AS VARCHAR) AS compounding_fee
    FROM (
      SELECT quote_mint, partner_fee, creator_fee, protocol_fee, referral_fee,
             CAST(0 AS DECIMAL(38,0)) AS lp_fee,
             CAST(0 AS DECIMAL(38,0)) AS compounding_fee FROM dbc
      UNION ALL
      SELECT quote_mint, partner_fee, creator_fee, protocol_fee, referral_fee, lp_fee, compounding_fee FROM damm
    ) t
    GROUP BY quote_mint
  `,
  );

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const row of rows) {
    const partner = Number(row.partner_fee ?? 0);
    const creator = Number(row.creator_fee ?? 0);
    const protocol = Number(row.protocol_fee ?? 0);
    const referral = Number(row.referral_fee ?? 0);
    const lpFee = Number(row.lp_fee ?? 0);
    const compounding = Number(row.compounding_fee ?? 0);
    const { holders, burn, lockedLp } = splitPartnerShare(
      partner,
      options.startOfDay,
    );

    dailyFees.add(row.quote_mint, holders, LABELS.Holders);
    dailyFees.add(row.quote_mint, burn, LABELS.Burn);
    dailyFees.add(row.quote_mint, lockedLp, LABELS.LockedLp);
    dailyFees.add(row.quote_mint, creator, LABELS.Creators);
    dailyFees.add(row.quote_mint, protocol, LABELS.Meteora);
    dailyFees.add(row.quote_mint, referral, LABELS.Referral);
    dailyFees.add(row.quote_mint, lpFee, LABELS.LpFees);
    dailyFees.add(row.quote_mint, compounding, LABELS.CompoundedLp);

    // $FUSED burn + locked LP = FusedPad holders revenue (protocol's own token).
    // Pair-token holder distributions are supply-side (paid to each launched coin's
    // holders, not $FUSED holders) — per DefiLlama holders-revenue guidance.
    dailyRevenue.add(row.quote_mint, burn, LABELS.Burn);
    dailyRevenue.add(row.quote_mint, lockedLp, LABELS.LockedLp);
    dailyHoldersRevenue.add(row.quote_mint, burn, LABELS.Burn);
    dailyHoldersRevenue.add(row.quote_mint, lockedLp, LABELS.LockedLp);

    dailySupplySideRevenue.add(row.quote_mint, holders, LABELS.Holders);
    dailySupplySideRevenue.add(row.quote_mint, creator, LABELS.Creators);
    dailySupplySideRevenue.add(row.quote_mint, protocol, LABELS.Meteora);
    dailySupplySideRevenue.add(row.quote_mint, referral, LABELS.Referral);
    dailySupplySideRevenue.add(row.quote_mint, lpFee, LABELS.LpFees);
    dailySupplySideRevenue.add(row.quote_mint, compounding, LABELS.CompoundedLp);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
    // No dailyProtocolRevenue: FusedPad keeps no treasury cut; partner share is holders revenue.
  };
};

const breakdownMethodology = {
  Fees: {
    [LABELS.Holders]:
      "0.90% of every FusedPad trade, paid out to holders of the pair token in the quote asset.",
    [LABELS.Burn]:
      "Share of the 0.20% $FUSED burn pot that is used to buy and permanently burn $FUSED. Until auto-LP is enabled this is the whole 0.20%; afterwards it is (10000 - lp_share_bps) / 10000 of that pot (default half).",
    [LABELS.LockedLp]:
      "Share of the 0.20% burn pot added as permanently locked $FUSED liquidity. Zero until $FUSED graduates and set_auto_lp is called; default thereafter is half of the burn pot (0.10%).",
    [LABELS.Creators]:
      "Coin creator share of the bonding-curve / graduated trading fee (creator_trading_fee_percentage of each config, 8 on live FusedPad configs ≈ 0.096% of volume).",
    [LABELS.Meteora]:
      "Meteora's protocol share of every trade (~0.30%), taken off the top before the curve accumulates anything.",
    [LABELS.Referral]:
      "Part of Meteora's protocol share handed back to whichever interface hosted the swap.",
    [LABELS.CompoundedLp]:
      "DAMM v2 compounding-mode LP fee that is reinvested into pool reserves (cp-amm 0.2.0+ compounding_fee). Zero on DBC and on non-compounding pools.",
    [LABELS.LpFees]:
      "Pre-0.2.0 DAMM v2 LP trading_fee / lp_fee paid by traders on migrated pools (separate from partner_fee). Zero on DBC and when only claiming_fee+compounding_fee are present.",
  },
  Revenue: {
    [LABELS.Burn]: "$FUSED buy-and-burn funded by FusedPad trading fees.",
    [LABELS.LockedLp]: "Permanently locked $FUSED liquidity funded by FusedPad trading fees (zero until auto-LP is enabled).",
  },
  HoldersRevenue: {
    [LABELS.Burn]: "$FUSED buy-and-burn funded by FusedPad trading fees.",
    [LABELS.LockedLp]: "Permanently locked $FUSED liquidity funded by FusedPad trading fees (zero until auto-LP is enabled).",
  },
  SupplySideRevenue: {
    [LABELS.Holders]: "0.90% paid to holders of each launched pair token (not $FUSED holders).",
    [LABELS.Creators]: "Fees paid to coin creators.",
    [LABELS.Meteora]: "Protocol fees paid to Meteora.",
    [LABELS.Referral]: "Referral fees paid to hosting frontends.",
    [LABELS.CompoundedLp]: "DAMM v2 compounding LP fees reinvested into pool reserves.",
    [LABELS.LpFees]: "Pre-0.2.0 DAMM v2 LP trading fees on migrated pools.",
  },
};

const adapter: SimpleAdapter = {
  // Dune queries run once a day; version 2 would re-run the same query hourly.
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: START,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  doublecounted: true, // Meteora DBC / DAMM adapters also see these pools
  methodology: {
    Fees:
      "1.50% of every FusedPad trade on Meteora DBC (pre-graduation) and DAMM v2 (post-graduation), in the pool's quote asset. Covers holder distributions, the $FUSED burn pot (and locked LP once enabled), coin-creator fees, Meteora's protocol fee, referral fees, and DAMM LP / compounding fees. Identified by DBC configs whose fee_claimer is the fused_fee Global PDA.",
    Revenue:
      "FusedPad value to $FUSED holders only: the 0.20% burn pot (buy-and-burn, and locked $FUSED LP once auto-LP is enabled). Pair-token holder distributions are supply-side, not FusedPad revenue. No treasury cut.",
    ProtocolRevenue:
      "Zero. FusedPad does not keep a separate treasury cut; $FUSED burn / locked LP is holders revenue.",
    HoldersRevenue:
      "The 0.20% $FUSED buy-and-burn pot (split into burn + permanently locked $FUSED LP once auto-LP is enabled). Pair-token payouts are not included here.",
    SupplySideRevenue:
      "0.90% pair-token holder distributions, coin creator fees (~0.096%), Meteora's ~0.30% protocol fee, referral fees, and DAMM LP / compounding fees.",
  },
  breakdownMethodology,
};

export default adapter;
