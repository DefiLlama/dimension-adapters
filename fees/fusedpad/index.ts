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
 *                      0.90%  holder distributions, paid in the quote token to
 *                             holders of the pool's base_mint. On every launched
 *                             coin that is cost of revenue (supply side); only on
 *                             $FUSED's own pool do they reach $FUSED holders.
 *                      0.20%  $FUSED buy-and-burn
 *                    After $FUSED itself graduates and set_auto_lp is called,
 *                    that 0.20% burn pot further splits by lp_share_bps
 *                    (default 5000 = half): 0.10% burn + 0.10% permanently
 *                    locked $FUSED/SOL LP. Until then AUTO_LP_ENABLED_FROM is
 *                    0 and the locked-LP label stays at zero.
 *
 * AFTER GRADUATION (DAMM v2)
 *
 * Every FusedPad config migrates 100% of the liquidity to Global as one
 * permanently locked position (partner_permanent_locked_liquidity_percentage =
 * 100, all creator LP percentages 0). FusedPad's income there is that
 * position's LP fee, which fused_fee crank_claim_damm claims and splits: 8% to
 * the creator when the config gives the creator no DAMM liquidity, then the same
 * 90/110 + 20/110. Migrated pools collect fees in both tokens; fused_fee only
 * splits the quote side, so base-token fees (left in Global's base account) are
 * not counted. Meteora's DAMM protocol fee and third-party LP fees are not
 * FusedPad's and are left to the Meteora adapters. No FusedPad pool had
 * graduated as of 2026-10-30 (0 of 41 PoolRecords).
 *
 * SCOPE
 *
 * Bonding-curve swaps (EvtSwap2) on every config whose fee_claimer is Global,
 * plus Global's DAMM v2 position-fee claims on pools migrated from those configs.
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
// $FUSED mint: Global.burn_mint on chain
const FUSED_MINT = "7SLA53amAEFJxaFJ4VLcS8RqxMg7Bmav1HnsCz7vpqhr";
// $FUSED's bonding-curve pool: fused_fee PoolRecord 2xcPjcJLmHopoJQ49QTZWLfk7yL86y5xCNg2EV8D5SQQ (base_mint = $FUSED)
const FUSED_DBC_POOL = "BePsC9wdYTYJ3QK3EUPRMmciTSpayi79kmuvkQZebv1Z";
// creator_trading_fee_percentage on live FusedPad configs (on-chain)
const CREATOR_PCT_FALLBACK = 8;
// fused_fee CREATOR_SHARE_NUM / CREATOR_SHARE_DENOM: creator cut of each DAMM v2 claim
const DAMM_CREATOR_PCT = 8;
// Partner-share split inside fused_fee (of the 1.104% partner cut)
const BURN_NUM = 20;
const SPLIT_DENOM = 110; // HOLDER_NUM (90) + BURN_NUM (20)
// Flip to the unix second of the day set_auto_lp lands on mainnet. 0 = off
// (today): all of the 0.20% burn pot is buy-and-burn; locked-LP stays 0.
const AUTO_LP_ENABLED_FROM = 0;
// Default on-chain lp_share_bps once auto-LP is enabled (half of the burn pot)
const AUTO_LP_BPS = 5_000;
// Day the first FusedPad config (CzaGq…, $FUSED pool) was created on mainnet
const START = "2026-10-10";

const LABELS = {
  CoinHolders: "Coin Holder Distributions",
  FusedHolders: "$FUSED Holder Distributions",
  Burn: METRIC.TOKEN_BUY_BACK,
  LockedLp: "Locked $FUSED Liquidity",
  Creators: METRIC.CREATOR_FEES,
  Meteora: "Protocol Fees to Meteora",
  Referral: "Referral Fees",
};

type Row = {
  quote_mint: string;
  is_fused: boolean;
  partner_fee: string | number;
  creator_fee: string | number;
  protocol_fee: string | number;
  referral_fee: string | number;
};

/**
 * Split one partner-share amount (already net of the creator cut) into holders,
 * $FUSED buy-and-burn, and (once auto-LP is on) locked $FUSED LP. Mirrors
 * fused_fee crank_claim: burn pot = floor(x * 20/110), holders = remainder; of
 * the burn pot, lp = floor(burn * AUTO_LP_BPS/10000) when enabled.
 */
export const splitPartnerShare = (
  partnerFee: number,
  atTimestamp: number,
): { holders: number; burn: number; lockedLp: number } => {
  const burnPot = Math.floor((partnerFee * BURN_NUM) / SPLIT_DENOM);
  const holders = partnerFee - burnPot;
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
          -- fused_fee crank_claim_damm sets the creator cut aside only when the config gives
          -- the creator no DAMM liquidity (none unlocked, permanently locked or vesting)
          CASE WHEN MAX(
              COALESCE(CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.ConfigParameters.creator_liquidity_percentage') AS INTEGER), 0)
            + COALESCE(CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.ConfigParameters.creator_permanent_locked_liquidity_percentage') AS INTEGER), 0)
            + COALESCE(CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.ConfigParameters.creator_liquidity_vesting_info.LiquidityVestingInfoParams.vesting_percentage') AS INTEGER), 0)
          ) > 0 THEN 0 ELSE ${DAMM_CREATOR_PCT} END AS damm_creator_pct
        -- Every config is emitted into both EvtCreateConfig and EvtCreateConfigV2, and
        -- only the V2 table carries config_parameters, so V2 alone is the full list.
        FROM meteora_solana.dynamic_bonding_curve_evt_evtcreateconfigv2
        WHERE fee_claimer = '${FEE_CLAIMER}'
        GROUP BY config
      ),
      -- EvtSwap2 alone holds every DBC trade exactly once (legacy swap emits
      -- EvtSwap + EvtSwap2; swap2 emits only EvtSwap2). Same rule as fees/vaultex.ts.
      dbc_swaps AS (
        SELECT
          s.config,
          s.pool = '${FUSED_DBC_POOL}' AS is_fused,
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
          s.is_fused,
          SUM(
            COALESCE(s.trading_fee, 0)
            - FLOOR(COALESCE(s.trading_fee, 0) * c.creator_pct / 100)
          ) AS partner_fee,
          SUM(FLOOR(COALESCE(s.trading_fee, 0) * c.creator_pct / 100)) AS creator_fee,
          SUM(COALESCE(s.protocol_fee, 0)) AS protocol_fee,
          SUM(COALESCE(s.referral_fee, 0)) AS referral_fee
        FROM dbc_swaps s
        JOIN fused_configs c ON c.config = s.config
        GROUP BY c.quote_mint, s.is_fused
      ),
      migrated AS (
        SELECT DISTINCT
          m.account_pool AS pool,
          c.quote_mint,
          c.damm_creator_pct,
          m.account_base_mint = '${FUSED_MINT}' AS is_fused
        FROM meteora_solana.dynamic_bonding_curve_call_migration_damm_v2 m
        JOIN fused_configs c ON c.config = m.account_config
      ),
      -- Global's locked position holds all of each graduated pool's migration liquidity.
      -- fused_fee crank_claim_damm claims its LP fee and splits only the quote side (token B).
      damm_claims AS (
        SELECT
          m.quote_mint,
          m.is_fused,
          m.damm_creator_pct,
          CAST(c.fee_b_claimed AS DECIMAL(38,0)) AS claimed
        FROM meteora_solana.cp_amm_evt_evtclaimpositionfee c
        JOIN migrated m ON c.pool = m.pool
        WHERE c.owner = '${FEE_CLAIMER}'
          AND c.evt_block_date >= CAST(from_unixtime(${options.startTimestamp}) AS DATE)
          AND c.evt_block_date <= CAST(from_unixtime(${options.endTimestamp}) AS DATE)
          AND c.evt_block_time >= from_unixtime(${options.startTimestamp})
          AND c.evt_block_time <  from_unixtime(${options.endTimestamp})
      ),
      damm AS (
        SELECT
          quote_mint,
          is_fused,
          SUM(claimed - FLOOR(claimed * damm_creator_pct / 100)) AS partner_fee,
          SUM(FLOOR(claimed * damm_creator_pct / 100)) AS creator_fee,
          CAST(0 AS DECIMAL(38,0)) AS protocol_fee,
          CAST(0 AS DECIMAL(38,0)) AS referral_fee
        FROM damm_claims
        GROUP BY quote_mint, is_fused
      )
    SELECT quote_mint, is_fused,
      CAST(SUM(partner_fee) AS VARCHAR) AS partner_fee,
      CAST(SUM(creator_fee) AS VARCHAR) AS creator_fee,
      CAST(SUM(protocol_fee) AS VARCHAR) AS protocol_fee,
      CAST(SUM(referral_fee) AS VARCHAR) AS referral_fee
    FROM (
      SELECT * FROM dbc
      UNION ALL
      SELECT * FROM damm
    ) t
    GROUP BY quote_mint, is_fused
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
    const { holders, burn, lockedLp } = splitPartnerShare(
      partner,
      options.startOfDay,
    );

    dailyFees.add(row.quote_mint, partner + creator + protocol + referral, METRIC.TRADING_FEES);

    // The $FUSED burn pot (burn + locked LP) accrues to $FUSED holders
    dailyRevenue.add(row.quote_mint, burn, LABELS.Burn);
    dailyRevenue.add(row.quote_mint, lockedLp, LABELS.LockedLp);
    dailyHoldersRevenue.add(row.quote_mint, burn, LABELS.Burn);
    dailyHoldersRevenue.add(row.quote_mint, lockedLp, LABELS.LockedLp);

    if (row.is_fused) {
      // On $FUSED's own pool the holder distribution is paid to $FUSED holders
      dailyRevenue.add(row.quote_mint, holders, LABELS.FusedHolders);
      dailyHoldersRevenue.add(row.quote_mint, holders, LABELS.FusedHolders);
    } else {
      // On every other pool it goes to holders of that launched coin
      dailySupplySideRevenue.add(row.quote_mint, holders, LABELS.CoinHolders);
    }

    dailySupplySideRevenue.add(row.quote_mint, creator, LABELS.Creators);
    dailySupplySideRevenue.add(row.quote_mint, protocol, LABELS.Meteora);
    dailySupplySideRevenue.add(row.quote_mint, referral, LABELS.Referral);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
    // FusedPad keeps no treasury cut; its share all reaches $FUSED holders.
    dailyProtocolRevenue: options.createBalances(),
  };
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]:
      "The 1.50% fee on every FusedPad bonding-curve trade, plus the quote-token LP fees FusedPad's locked liquidity earns on graduated coins' Meteora DAMM v2 pools.",
  },
  Revenue: {
    [LABELS.Burn]: "$FUSED buy-and-burn funded by FusedPad trading fees.",
    [LABELS.LockedLp]: "Permanently locked $FUSED liquidity funded by FusedPad trading fees (zero until auto-LP is enabled).",
    [LABELS.FusedHolders]: "0.90% of every $FUSED trade on FusedPad, paid out to $FUSED holders in SOL.",
  },
  HoldersRevenue: {
    [LABELS.Burn]: "$FUSED buy-and-burn funded by FusedPad trading fees.",
    [LABELS.LockedLp]: "Permanently locked $FUSED liquidity funded by FusedPad trading fees (zero until auto-LP is enabled).",
    [LABELS.FusedHolders]: "0.90% of every $FUSED trade on FusedPad, paid out to $FUSED holders in SOL.",
  },
  SupplySideRevenue: {
    [LABELS.CoinHolders]: "0.90% of every trade in a launched coin, paid out to holders of that coin in the quote asset.",
    [LABELS.Creators]: "Coin creator share: 8% of the bonding-curve trading fee (~0.096% of volume) and 8% of FusedPad's LP fees after graduation.",
    [LABELS.Meteora]: "Meteora's ~0.30% protocol share of every bonding-curve trade.",
    [LABELS.Referral]: "Part of Meteora's protocol share handed back to whichever interface hosted the swap.",
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
      "1.50% of every FusedPad trade on the Meteora bonding curve, plus the quote-token LP fees FusedPad's locked liquidity earns after a coin graduates to Meteora DAMM v2. Covers holder distributions, the $FUSED burn pot, coin-creator fees, Meteora's protocol fee and referral fees. Identified by bonding-curve configs whose fee_claimer is the fused_fee Global PDA.",
    UserFees: "The 1.50% a trader pays on every FusedPad bonding-curve trade, plus FusedPad's LP fees on graduated coins.",
    Revenue:
      "The ~0.20% of every FusedPad trade used to buy and burn $FUSED (half becomes locked $FUSED liquidity once auto-LP is enabled), plus the 0.90% holder distribution on $FUSED's own pool, which goes to $FUSED holders. No treasury cut.",
    ProtocolRevenue:
      "Zero. FusedPad does not keep a treasury cut; its share of trading fees goes to $FUSED holders through buy-and-burn and $FUSED holder distributions.",
    HoldersRevenue:
      "The ~0.20% of every FusedPad trade used to buy and burn $FUSED (split into burn + permanently locked $FUSED liquidity once auto-LP is enabled), plus the 0.90% of every $FUSED trade paid out to $FUSED holders.",
    SupplySideRevenue:
      "0.90% paid out to holders of each launched coin, coin creator fees (~0.096%), Meteora's ~0.30% protocol fee, and referral fees paid to hosting frontends.",
  },
  breakdownMethodology,
};

export default adapter;
