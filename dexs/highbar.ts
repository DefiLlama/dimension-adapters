import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import ADDRESSES from "../helpers/coreAssets.json";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { assertDuneSolanaIndexed } from "../helpers/duneSolanaDex";

/**
 * highbar (https://highbar.capital, https://x.com/highbar_capital): a Solana token launchpad on Meteora's
 * Dynamic Bonding Curve (dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN). A coin that fills its curve graduates
 * into a Meteora DAMM v2 pool (migration_option = 1 on every config).
 *
 * WHAT IDENTIFIES HIGHBAR ON CHAIN
 *
 * Six DBC partner configs, all created on 2026-10-30 with the same fee_claimer, highbar's partner wallet
 * 48UKpEwL4MzMxS7s8sZVZbCo4sEFP59CvermMniPhigh (fee_claimer is fixed at config creation). Every coin launched
 * on highbar is a DBC pool on one of these configs; coin-create transactions are signed by each creator, so the
 * pool signer is not a usable key. The configs below are the full list of DBC configs whose fee_claimer is that
 * wallet (getProgramAccounts on the DBC program, memcmp on PoolConfig.fee_claimer), and every value next to a key
 * was decoded from that config account on chain. The query also finds configs by fee_claimer (EvtCreateConfigV2,
 * emitted by create_config), so a new highbar config with no entry below makes fetch throw instead of going uncounted.
 *
 * FEE WATERFALL ON THE CURVE (quote side, collect_fee_mode = 0, so every curve fee is paid in SOL)
 *
 *   Each config charges a base fee (flat 1%, or on the anti-sniper configs a 25% fee decaying to 1% over the
 *   first 60 seconds of trading). Meteora keeps 20% of it (protocol_fee, part of which it pays as referral_fee to
 *   the interface the swap named); the other 80% is trading_fee, split by creator_trading_fee_percentage between
 *   the coin creator and highbar (the program floors the creator's part).
 *
 * MIGRATION FEE
 *
 *   When a curve graduates, migration_fee_percentage of the migration quote threshold is taken as a migration fee,
 *   split by creator_migration_fee_percentage between creator and highbar (DBC
 *   PoolConfig::get_migration_fee_distribution). It is counted on the day the coin migrates.
 *
 * AFTER GRADUATION (DAMM v2, 1% pool fee, migrated_pool_fee_bps = 100)
 *
 *   All migrated liquidity is permanently locked, split between a partner position (owned by the fee_claimer,
 *   DBC migrate_damm_v2_initialize_pool) and a creator position. highbar's income there is the LP fee its own
 *   position earns, counted when the fee_claimer claims it (cp_amm EvtClaimPositionFee). Only the SOL side
 *   (token B) is counted: migrated_collect_fee_mode = 0 on every config takes the fee from the output token, so
 *   buys pay it in the launched coin (token A), which has no reliable price. Trading volume, Meteora's DAMM v2
 *   protocol fee and the creator position's LP fees in graduated pools belong to Meteora DAMM v2 and are not
 *   counted here.
 */

const DBC_PROGRAM = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";
// highbar partner wallet: fee_claimer of every highbar DBC config, owner of the partner DAMM v2 position after migration
const FEE_CLAIMER = "48UKpEwL4MzMxS7s8sZVZbCo4sEFP59CvermMniPhigh";
const SOL = ADDRESSES.solana.SOL;
// The day the six highbar configs were created on mainnet (2026-10-30 11:59 UTC); no highbar pool exists before it
const START = "2026-10-30";

type ConfigParams = {
  // creator_trading_fee_percentage: creator's % of trading_fee (the 80% of the curve fee Meteora does not keep)
  creatorTradingFeePct: number;
  // migration_quote_threshold, in lamports (all configs are quoted in SOL)
  migrationQuoteThreshold: bigint;
  // migration_fee_percentage: % of the migration quote threshold taken as migration fee
  migrationFeePct: number;
  // creator_migration_fee_percentage: creator's % of that migration fee, highbar keeps the rest
  creatorMigrationFeePct: number;
};

// Decoded from each PoolConfig account on chain (DBC program, fee_claimer = FEE_CLAIMER, quote_mint = wSOL).
// Tiers are the migration threshold: 85, 150 and 250 SOL. Each tier has a flat 1% config and an anti-sniper config
// (cliff fee 25%, exponential scheduler, 60 x 1s periods, reduction factor 522 bps, ending at 1%).
const CONFIGS: Record<string, ConfigParams> = {
  // 85 SOL tier, flat 1%
  "5WKoTa3R3ocVEUEbGEAjkpM1HjtrCUR3mGLf1xCuSi9x": { creatorTradingFeePct: 50, migrationQuoteThreshold: 85_000_000_000n, migrationFeePct: 1, creatorMigrationFeePct: 0 },
  // 85 SOL tier, anti-sniper fee scheduler
  "49ZrJxJUqCzovYNGchxMvAivqDPgXY2ThiQai4T1P82y": { creatorTradingFeePct: 50, migrationQuoteThreshold: 85_000_000_000n, migrationFeePct: 1, creatorMigrationFeePct: 0 },
  // 150 SOL tier, flat 1%
  "3xK6Ga1hByuK75U4Bv7Tj8LSmsQj9CuUQKW8Tj93FoqN": { creatorTradingFeePct: 62, migrationQuoteThreshold: 150_000_000_000n, migrationFeePct: 1, creatorMigrationFeePct: 50 },
  // 150 SOL tier, anti-sniper fee scheduler
  "7XmABRc7HtPrXsA1mcJSy4jYEbnZY439e1DHckiJ1q2J": { creatorTradingFeePct: 62, migrationQuoteThreshold: 150_000_000_000n, migrationFeePct: 1, creatorMigrationFeePct: 50 },
  // 250 SOL tier, flat 1%
  "6qKCzc5UajAFedp35T3AAbEEoMuh8FxNiAxjA97RNK82": { creatorTradingFeePct: 75, migrationQuoteThreshold: 250_000_000_000n, migrationFeePct: 0, creatorMigrationFeePct: 0 },
  // 250 SOL tier, anti-sniper fee scheduler
  "GBM9m9g96Y6CP8nzEQuPeGJpsmf9PfR1SWuxeUDHbrfN": { creatorTradingFeePct: 75, migrationQuoteThreshold: 250_000_000_000n, migrationFeePct: 0, creatorMigrationFeePct: 0 },
};

const quoted = (values: string[]) => values.map((value) => `'${value}'`).join(", ");

const query = ({ startTimestamp, endTimestamp }: FetchOptions) => {
  // Dune partitions the decoded Solana tables by *_block_date; bound it next to every *_block_time filter
  const window = (column: string) => {
    const dateColumn = column.replace(/_block_time$/, "_block_date");
    return `${dateColumn} >= CAST(from_unixtime(${startTimestamp}) AS DATE) AND ${dateColumn} <= CAST(from_unixtime(${endTimestamp}) AS DATE)
      AND ${column} >= from_unixtime(${startTimestamp}) AND ${column} < from_unixtime(${endTimestamp})`;
  };
  return `
    WITH
    -- The known configs plus every config created with highbar's fee_claimer; one missing from CONFIGS makes fetch throw
    highbar_configs AS (
      SELECT config FROM UNNEST(ARRAY[${quoted(Object.keys(CONFIGS))}]) AS t(config)
      UNION
      SELECT config
      FROM meteora_solana.dynamic_bonding_curve_evt_evtcreateconfigv2
      WHERE fee_claimer = '${FEE_CLAIMER}'
        AND evt_executing_account = '${DBC_PROGRAM}'
        AND evt_block_date >= DATE '${START}'
    ),
    -- EvtSwap2 holds every DBC trade exactly once (legacy swap emits EvtSwap + EvtSwap2, swap2 only EvtSwap2)
    curve_swaps AS (
      SELECT
        config,
        trade_direction,
        CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult2.included_fee_input_amount') AS DECIMAL(38,0)) AS included_fee_input_amount,
        CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult2.output_amount') AS DECIMAL(38,0)) AS output_amount,
        CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult2.trading_fee') AS DECIMAL(38,0)) AS trading_fee,
        CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult2.protocol_fee') AS DECIMAL(38,0)) AS protocol_fee,
        CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult2.referral_fee') AS DECIMAL(38,0)) AS referral_fee
      FROM meteora_solana.dynamic_bonding_curve_evt_evtswap2
      WHERE config IN (SELECT config FROM highbar_configs)
        AND evt_executing_account = '${DBC_PROGRAM}'
        AND ${window("evt_block_time")}
    ),
    -- Every highbar curve that graduated into DAMM v2 up to the end of the window
    migrations AS (
      SELECT DISTINCT account_config AS config, account_pool AS pool, call_block_time
      FROM meteora_solana.dynamic_bonding_curve_call_migration_damm_v2
      WHERE account_config IN (SELECT config FROM highbar_configs)
        AND call_block_date >= DATE '${START}'
        AND call_block_time < from_unixtime(${endTimestamp})
    )
    SELECT
      'curve' AS metric, config, '${SOL}' AS mint,
      -- Quote side of every trade, gross of fees: what a buyer paid in (trade_direction 1), what a seller received
      -- plus the fees taken from that output (collect_fee_mode 0 charges the fee on the quote side)
      CAST(SUM(CASE WHEN trade_direction = 1 THEN COALESCE(included_fee_input_amount, 0)
        ELSE COALESCE(output_amount, 0) + COALESCE(trading_fee, 0) + COALESCE(protocol_fee, 0) + COALESCE(referral_fee, 0) END) AS VARCHAR) AS volume,
      CAST(SUM(COALESCE(trading_fee, 0)) AS VARCHAR) AS trading_fee,
      CAST(SUM(COALESCE(protocol_fee, 0)) AS VARCHAR) AS protocol_fee,
      CAST(SUM(COALESCE(referral_fee, 0)) AS VARCHAR) AS referral_fee,
      CAST(0 AS VARCHAR) AS migrations,
      CAST(0 AS VARCHAR) AS claimed
    FROM curve_swaps
    GROUP BY config
    UNION ALL
    SELECT 'migration', config, '${SOL}', '0', '0', '0', '0', CAST(COUNT(*) AS VARCHAR), '0'
    FROM migrations
    WHERE call_block_time >= from_unixtime(${startTimestamp})
    GROUP BY config
    UNION ALL
    -- LP fees of highbar's locked partner position in graduated pools, when claimed: token B (SOL) only, token A is
    -- the launched coin
    SELECT 'position_fees', m.config, '${SOL}', '0', '0', '0', '0', '0', CAST(SUM(CAST(f.fee_b_claimed AS DECIMAL(38,0))) AS VARCHAR)
    FROM meteora_solana.cp_amm_evt_evtclaimpositionfee f
    JOIN migrations m ON m.pool = f.pool
    WHERE f.owner = '${FEE_CLAIMER}' AND ${window("f.evt_block_time")}
    GROUP BY m.config
  `;
};

type Row = {
  metric: "curve" | "migration" | "position_fees";
  config: string;
  mint: string;
  volume: string | null;
  trading_fee: string | null;
  protocol_fee: string | null;
  referral_fee: string | null;
  migrations: string | null;
  claimed: string | null;
};

const LABELS = {
  CURVE_FEES: "Bonding Curve Trading Fees",
  MIGRATION_FEES: "Migration Fees",
  POOL_FEES: "Graduated Pool LP Fees",
  CURVE_TO_HIGHBAR: "Bonding Curve Trading Fees To highbar",
  CURVE_TO_CREATORS: "Bonding Curve Trading Fees To Creators",
  CURVE_TO_METEORA: "Bonding Curve Trading Fees To Meteora",
  CURVE_TO_REFERRERS: "Bonding Curve Referral Fees To Interfaces",
  MIGRATION_TO_HIGHBAR: "Migration Fees To highbar",
  MIGRATION_TO_CREATORS: "Migration Fees To Creators",
  POOL_TO_HIGHBAR: "Graduated Pool LP Fees To highbar",
};

const big = (value: string | null | undefined) => BigInt(value ?? 0);

const fetch = async (options: FetchOptions) => {
  assertDuneSolanaIndexed(options);
  const rows: Row[] = await queryDuneSql(options, query(options));

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const row of rows) {
    const config = CONFIGS[row.config];
    if (!config) throw new Error(`highbar: DBC config ${row.config} has highbar's fee_claimer but no entry in CONFIGS; decode its fee split and add it`);

    if (row.metric === "curve") {
      const trading = big(row.trading_fee);
      // DBC floors the creator's share of trading_fee on each swap; flooring the sum can differ by < 1 lamport per swap
      const creators = (trading * BigInt(config.creatorTradingFeePct)) / 100n;
      const meteora = big(row.protocol_fee);
      const referral = big(row.referral_fee);
      const total = trading + meteora + referral;

      dailyVolume.add(row.mint, big(row.volume));
      dailyFees.add(row.mint, total, LABELS.CURVE_FEES);
      dailyUserFees.add(row.mint, total, LABELS.CURVE_FEES);
      dailyRevenue.add(row.mint, trading - creators, LABELS.CURVE_TO_HIGHBAR);
      dailySupplySideRevenue.add(row.mint, creators, LABELS.CURVE_TO_CREATORS);
      dailySupplySideRevenue.add(row.mint, meteora, LABELS.CURVE_TO_METEORA);
      dailySupplySideRevenue.add(row.mint, referral, LABELS.CURVE_TO_REFERRERS);
    } else if (row.metric === "migration") {
      // DBC PoolConfig::get_migration_quote_amount / get_migration_fee_distribution
      const threshold = config.migrationQuoteThreshold;
      const quoteAmount = (threshold * BigInt(100 - config.migrationFeePct) + 99n) / 100n; // rounded up
      const fee = threshold - quoteAmount;
      const creators = (fee * BigInt(config.creatorMigrationFeePct)) / 100n;
      const count = big(row.migrations);

      dailyFees.add(row.mint, fee * count, LABELS.MIGRATION_FEES);
      dailyRevenue.add(row.mint, (fee - creators) * count, LABELS.MIGRATION_TO_HIGHBAR);
      dailySupplySideRevenue.add(row.mint, creators * count, LABELS.MIGRATION_TO_CREATORS);
    } else if (row.metric === "position_fees") {
      const claimed = big(row.claimed);
      dailyFees.add(row.mint, claimed, LABELS.POOL_FEES);
      dailyUserFees.add(row.mint, claimed, LABELS.POOL_FEES);
      dailyRevenue.add(row.mint, claimed, LABELS.POOL_TO_HIGHBAR);
    } else {
      throw new Error(`highbar: unknown metric ${(row as Row).metric}`);
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "SOL value of every buy and sell on the bonding curves of coins launched on highbar (Meteora DBC pools on highbar's configs), gross of fees, read from the DBC swap events. Trading after a coin graduates is Meteora DAMM v2 volume and is not counted. Double counted: Meteora DBC also lists this volume.",
  Fees: "Everything traders pay on highbar bonding curves (a 1% fee, or on anti-sniper launches a fee starting at 25% and falling to 1% within the first minute), including Meteora's 20% share; the migration fee taken from a curve's SOL when a coin graduates (1% of the 85 and 150 SOL thresholds, none on the 250 SOL tier); and the SOL LP fees highbar's locked liquidity earns in graduated Meteora DAMM v2 pools, when claimed. Excludes graduated-pool fees paid in the launched coin, and the creator's and Meteora's share of graduated-pool fees.",
  UserFees: "What traders pay: the bonding curve fee and the SOL graduated-pool LP fees claimed by highbar; not the migration fee, which comes out of the curve's reserve.",
  Revenue: "highbar's share: 50%, 38% or 25% (85, 150 and 250 SOL tiers) of the 80% of the bonding curve fee Meteora does not keep, its share of the migration fee (all of it on the 85 SOL tier, half on the 150 SOL tier), and the claimed SOL LP fees of its locked liquidity in graduated pools.",
  ProtocolRevenue: "highbar's share of bonding curve fees, migration fees and SOL graduated-pool LP fees, all paid to the highbar partner wallet (fee claimer).",
  SupplySideRevenue: "The coin creator's share of the bonding curve fee (50%, 62% or 75% of the 80% Meteora does not keep) and of the migration fee, Meteora's 20% protocol fee, and the referral fee Meteora pays the interface a swap names.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.CURVE_FEES]: "The whole fee traders pay on every buy and sell on a highbar bonding curve, in SOL: 1%, or on anti-sniper launches 25% at launch decaying to 1% over 60 seconds. 80% is shared by the coin creator and highbar, 20% goes to Meteora.",
    [LABELS.MIGRATION_FEES]: "The migration fee taken when a curve graduates to Meteora DAMM v2: 1% of the 85 SOL or 150 SOL threshold, 0% on the 250 SOL tier.",
    [LABELS.POOL_FEES]: "SOL LP fees earned by highbar's permanently locked liquidity in graduated Meteora DAMM v2 pools (1% pool fee), counted when claimed. Fees on buys are paid in the launched coin and are not counted.",
  },
  UserFees: {
    [LABELS.CURVE_FEES]: "The whole fee traders pay on every bonding curve trade.",
    [LABELS.POOL_FEES]: "SOL LP fees traders pay to highbar's locked liquidity in graduated pools, when claimed.",
  },
  Revenue: {
    [LABELS.CURVE_TO_HIGHBAR]: "highbar's share of the 80% of the bonding curve fee Meteora does not keep: 50% (85 SOL tier), 38% (150 SOL tier) or 25% (250 SOL tier).",
    [LABELS.MIGRATION_TO_HIGHBAR]: "highbar's share of the migration fee: all of it on the 85 SOL tier, half on the 150 SOL tier.",
    [LABELS.POOL_TO_HIGHBAR]: "Claimed SOL LP fees of highbar's locked liquidity in graduated pools.",
  },
  ProtocolRevenue: {
    [LABELS.CURVE_TO_HIGHBAR]: "highbar's share of the 80% of the bonding curve fee Meteora does not keep: 50% (85 SOL tier), 38% (150 SOL tier) or 25% (250 SOL tier).",
    [LABELS.MIGRATION_TO_HIGHBAR]: "highbar's share of the migration fee: all of it on the 85 SOL tier, half on the 150 SOL tier.",
    [LABELS.POOL_TO_HIGHBAR]: "Claimed SOL LP fees of highbar's locked liquidity in graduated pools.",
  },
  SupplySideRevenue: {
    [LABELS.CURVE_TO_CREATORS]: "The coin creator's share of the 80% of the bonding curve fee Meteora does not keep: 50%, 62% or 75% by tier.",
    [LABELS.CURVE_TO_METEORA]: "Meteora's protocol fee: its 20% of the bonding curve fee, less the referral fee it pays.",
    [LABELS.CURVE_TO_REFERRERS]: "The referral fee Meteora pays, out of its 20%, to the interface a bonding curve swap names.",
    [LABELS.MIGRATION_TO_CREATORS]: "The coin creator's half of the migration fee on the 150 SOL tier.",
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
  doublecounted: true, // the Meteora DBC adapter also counts these curves
  methodology,
  breakdownMethodology,
};

export default adapter;
