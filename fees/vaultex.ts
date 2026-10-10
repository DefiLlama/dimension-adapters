import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { METRIC } from "../dexs/latch-protocol";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { assertDuneSolanaIndexed } from "../helpers/duneSolanaDex";

/**
 * Vaultex (https://vaultex.fun), a Solana meme coin launchpad built on Meteora's
 * Dynamic Bonding Curve (dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN).
 *
 * WHAT IDENTIFIES VAULTEX ON CHAIN
 *
 * Vaultex lets a creator pair a coin with one of several quote assets (SOL, USDC
 * and others), so there is one DBC partner config per quote asset rather than a
 * single config. Every one of them is created with the same partner fee claimer,
 * the Vaultex treasury 4wwpefxyZ2nqeePNa2fctMuu5273wrzkUuoy5wC2QeP2. fee_claimer
 * is fixed at config creation and cannot be changed afterwards, so configs are
 * selected by it. The create transaction of a coin is signed by the creator's own
 * wallet, so the pool signer is not a usable key.
 *
 * FEE WATERFALL (read from the configs on chain)
 *
 * Flat 2% of the quote side of every curve trade, no fee scheduler.
 *   0.400%  Meteora protocol share (20%, taken first; the event reports it as
 *           protocol_fee plus the referral_fee leg it hands to a hosting frontend)
 *   1.600%  trading_fee, split by the config's creator_trading_fee_percentage
 *           (63 on current configs):
 *             1.008%  coin creator
 *             0.592%  Vaultex
 * The split is read per config from evtcreateconfigv2, not hardcoded.
 * Fees are read from EvtSwap2 only, which every DBC swap emits once.
 *
 * SCOPE
 *
 * Bonding-curve trades only. Post-graduation trading happens on Meteora DAMM v2
 * and is already counted under Meteora; it is left out here.
 */

const DBC_PROGRAM = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";
const VAULTEX_FEE_CLAIMER = "4wwpefxyZ2nqeePNa2fctMuu5273wrzkUuoy5wC2QeP2";
// The day the first Vaultex config with this fee claimer was created on mainnet
// (config Dsj1V3FARMfLVvWW5M3bAfwh7LvKZ3AKb7mMUmj7mVA5). No Vaultex pool, and so
// no Vaultex fee, can exist before it.
const START = "2026-08-12";

const LABELS = {
  ToVaultex: "Trading Fees to Vaultex",
  ToCreators: "Trading Fees to Creators",
  Meteora: "Protocol Fees to Meteora",
  Referral: "Referral Fees",
};

type Row = {
  quote_mint: string;
  trading_fee: number;
  creator_fee: number;
  protocol_fee: number;
  referral_fee: number;
};

const fetch = async (options: FetchOptions) => {
  assertDuneSolanaIndexed(options);
  const rows: Row[] = await queryDuneSql(options, `
    WITH
      vaultex_configs AS (
        SELECT
          config,
          MIN(quote_mint) AS quote_mint,
          MIN(CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.creator_trading_fee_percentage') AS INTEGER)) AS creator_pct
        FROM meteora_solana.dynamic_bonding_curve_evt_evtcreateconfigv2
        WHERE fee_claimer = '${VAULTEX_FEE_CLAIMER}'
        GROUP BY config
      ),
      -- A legacy swap emits both EvtSwap and EvtSwap2 and swap2 emits only EvtSwap2,
      -- so EvtSwap2 alone holds every trade exactly once.
      swaps AS (
        SELECT s.config,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult2.trading_fee') AS DECIMAL(38,0)) AS trading_fee,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult2.protocol_fee') AS DECIMAL(38,0)) AS protocol_fee,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult2.referral_fee') AS DECIMAL(38,0)) AS referral_fee
        FROM meteora_solana.dynamic_bonding_curve_evt_evtswap2 s
        WHERE s.config IN (SELECT config FROM vaultex_configs)
          AND s.evt_executing_account = '${DBC_PROGRAM}'
          AND s.evt_block_date >= CAST(from_unixtime(${options.startTimestamp}) AS DATE)
          AND s.evt_block_date <= CAST(from_unixtime(${options.endTimestamp}) AS DATE)
          AND s.evt_block_time >= from_unixtime(${options.startTimestamp})
          AND s.evt_block_time <  from_unixtime(${options.endTimestamp})
      )
    SELECT
      c.quote_mint,
      SUM(COALESCE(s.trading_fee, 0)) AS trading_fee,
      -- creator_trading_fee_percentage is a whole percent (0..100); the curve
      -- program floors the creator share on each swap, so floor per swap here too
      SUM(FLOOR(COALESCE(s.trading_fee, 0) * c.creator_pct / 100)) AS creator_fee,
      SUM(COALESCE(s.protocol_fee, 0)) AS protocol_fee,
      SUM(COALESCE(s.referral_fee, 0)) AS referral_fee
    FROM swaps s
    JOIN vaultex_configs c ON c.config = s.config
    GROUP BY c.quote_mint
  `);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const row of rows) {
    const trading = Number(row.trading_fee ?? 0);
    const creator = Number(row.creator_fee ?? 0);
    const vaultex = trading - creator;
    const protocol = Number(row.protocol_fee ?? 0);
    const referral = Number(row.referral_fee ?? 0);

    dailyFees.add(row.quote_mint, vaultex + protocol + referral + creator, METRIC.SWAP_FEES);

    dailyRevenue.add(row.quote_mint, vaultex, LABELS.ToVaultex);

    dailySupplySideRevenue.add(row.quote_mint, creator, LABELS.ToCreators);
    dailySupplySideRevenue.add(row.quote_mint, protocol, LABELS.Meteora);
    dailySupplySideRevenue.add(row.quote_mint, referral, LABELS.Referral);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "2% fee on every bonding-curve trade: trading_fee + protocol_fee + referral_fee from Meteora DBC swap events.",
  },
  Revenue: {
    [LABELS.ToVaultex]: "Vaultex share of bonding-curve trade fees, claimable by the Vaultex fee claimer.",
  },
  ProtocolRevenue: {
    [LABELS.ToVaultex]: "Same as Revenue, all of it goes to the Vaultex treasury.",
  },
  SupplySideRevenue: {
    [LABELS.ToCreators]: "Trade fees paid to coin creators.",
    [LABELS.Meteora]: "Protocol fees paid to Meteora.",
    [LABELS.Referral]: "Referral fees paid to hosting frontends.",
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
  doublecounted: true, // meteora-dbc also tracks these pools
  methodology: {
    Fees: "2% fee on every bonding-curve trade: trading_fee + protocol_fee + referral_fee from Meteora DBC swap events.",
    Revenue: "Vaultex share of the trading fee (100% minus the config's creator percentage; 37% on current configs).",
    ProtocolRevenue: "Vaultex share of the trading fee (100% minus the config's creator percentage; 37% on current configs).",
    SupplySideRevenue: "Creator share of the trading fee plus the Meteora protocol and referral fees.",
  },
  breakdownMethodology,
};

export default adapter;
