import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import ADDRESSES from "../helpers/coreAssets.json";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { assertDuneSolanaIndexed } from "../helpers/duneSolanaDex";

// Ryntra Launch (https://ryntra.io): a launchpad on Meteora's Dynamic Bonding Curve (DBC). Every address below is in
// Ryntra's public attribution registry (https://ryntra.io/api/stats/registry, drawn on https://ryntra.io/stats).
// Meteora already lists the volume, so it is double counted.

export const LAUNCH_CONFIGS = ["B6gheJ5PL6tpE9V3vQGYA8wLqe3pcFh1fgKf4aPxZh1G", "33KU1WNMVAXLBuGF1EQAHqWFnrsDevofJnw4VAamiK2G"];
export const CONFIGS_CREATED = "2026-10-05";
export const LAUNCH_POOL_PAYER = "H2Bzv5pcrEGug1STGbZhvX98DGb3SCFa4pnAtUwktyyV";
const FEE_CLAIMER = "22BZNVD9FuZPQvGwALBwhopSyxUCTuNNeTW1Lr1KsSvA";
const REFERRAL_ACCOUNT = "4kVogGhWqheXKjteM2urywUS5L8q7AnSNJCYDna4VrDy";
const USDC = ADDRESSES.solana.USDC;

const quoted = (values: string[]) => values.map((value) => `'${value}'`).join(", ");

const query = ({ startTimestamp, endTimestamp }: FetchOptions) => {
  const window = (column: string) => `${column} >= from_unixtime(${startTimestamp}) AND ${column} < from_unixtime(${endTimestamp})`;
  return `
    WITH
    -- Every pool Ryntra Launch created, with the creator's share of the trading fee its config sets.
    launches AS (
      SELECT p.pool, CAST(JSON_EXTRACT_SCALAR(c.config_parameters, '$.ConfigParameters.creator_trading_fee_percentage') AS BIGINT) AS creator_percent
      FROM meteora_solana.dynamic_bonding_curve_evt_evtinitializepool p
      JOIN meteora_solana.dynamic_bonding_curve_evt_evtcreateconfigv2 c ON c.config = p.config
      WHERE p.config IN (${quoted(LAUNCH_CONFIGS)})
        AND p.evt_tx_signer = '${LAUNCH_POOL_PAYER}'
        AND p.evt_block_time >= TIMESTAMP '${CONFIGS_CREATED}'
        AND c.evt_block_time >= TIMESTAMP '${CONFIGS_CREATED}'
    ),
    -- The Meteora DAMM v2 pool each launch graduated into: token A the launched token, token B USDC.
    graduated AS (
      SELECT account_pool AS pool, account_base_mint AS base_mint
      FROM meteora_solana.dynamic_bonding_curve_call_migration_damm_v2
      WHERE account_virtual_pool IN (SELECT pool FROM launches)
        AND call_block_time >= TIMESTAMP '${CONFIGS_CREATED}'
    ),
    -- Every swap on those curves and graduated pools, from its EvtSwap2 (both swap and swap2 emit it), with the
    -- referral token account its instruction named. Instruction and event are paired in order within the same outer
    -- instruction.
    events AS (
      SELECT 'curve' AS market, evt_tx_id AS tx_id, pool, evt_outer_instruction_index AS outer_ix,
        ROW_NUMBER() OVER (PARTITION BY evt_tx_id, pool, evt_outer_instruction_index ORDER BY evt_inner_instruction_index) AS nth,
        trade_direction, swap_result
      FROM meteora_solana.dynamic_bonding_curve_evt_evtswap2
      WHERE pool IN (SELECT pool FROM launches) AND ${window("evt_block_time")}
      UNION ALL
      SELECT 'graduated', evt_tx_id, pool, evt_outer_instruction_index,
        ROW_NUMBER() OVER (PARTITION BY evt_tx_id, pool, evt_outer_instruction_index ORDER BY evt_inner_instruction_index),
        trade_direction, swap_result
      FROM meteora_solana.cp_amm_evt_evtswap2
      WHERE pool IN (SELECT pool FROM graduated) AND ${window("evt_block_time")}
    ),
    calls AS (
      SELECT tx_id, pool, outer_ix, referral,
        ROW_NUMBER() OVER (PARTITION BY tx_id, pool, outer_ix ORDER BY inner_ix NULLS FIRST) AS nth
      FROM (
        SELECT call_tx_id AS tx_id, account_pool AS pool, call_outer_instruction_index AS outer_ix, call_inner_instruction_index AS inner_ix, account_referral_token_account AS referral
        FROM meteora_solana.dynamic_bonding_curve_call_swap
        WHERE account_pool IN (SELECT pool FROM launches) AND ${window("call_block_time")}
        UNION ALL
        SELECT call_tx_id, account_pool, call_outer_instruction_index, call_inner_instruction_index, account_referral_token_account
        FROM meteora_solana.dynamic_bonding_curve_call_swap2
        WHERE account_pool IN (SELECT pool FROM launches) AND ${window("call_block_time")}
        UNION ALL
        SELECT call_tx_id, account_pool, call_outer_instruction_index, call_inner_instruction_index, account_referral_token_account
        FROM meteora_solana.cp_amm_call_swap
        WHERE account_pool IN (SELECT pool FROM graduated) AND ${window("call_block_time")}
        UNION ALL
        SELECT call_tx_id, account_pool, call_outer_instruction_index, call_inner_instruction_index, account_referral_token_account
        FROM meteora_solana.cp_amm_call_swap2
        WHERE account_pool IN (SELECT pool FROM graduated) AND ${window("call_block_time")}
      )
    ),
    swaps AS (
      SELECT e.market, e.pool, c.referral = '${REFERRAL_ACCOUNT}' AS through_ryntra,
        -- The quote side: what a buyer paid in, what a seller received (trade_direction 1 is a buy).
        CAST(JSON_EXTRACT_SCALAR(e.swap_result, CASE WHEN e.trade_direction = 1 THEN '$.SwapResult2.included_fee_input_amount' ELSE '$.SwapResult2.output_amount' END) AS BIGINT) AS quote_volume,
        -- What the trader pays on a curve is trading_fee + protocol_fee + referral_fee. trading_fee is the configs'
        -- 80%, shared by the creator and Ryntra; Meteora keeps the other 20%, paying the referral fee out of it to the
        -- referral account the swap named and keeping the rest as protocol_fee.
        CAST(JSON_EXTRACT_SCALAR(e.swap_result, '$.SwapResult2.trading_fee') AS BIGINT) AS trading_fee,
        CAST(JSON_EXTRACT_SCALAR(e.swap_result, '$.SwapResult2.protocol_fee') AS BIGINT) AS protocol_fee,
        CAST(JSON_EXTRACT_SCALAR(e.swap_result, '$.SwapResult2.referral_fee') AS BIGINT) AS referral_fee
      FROM events e
      LEFT JOIN calls c ON c.tx_id = e.tx_id AND c.pool = e.pool AND c.outer_ix = e.outer_ix AND c.nth = e.nth
    ),
    -- What Ryntra takes as the partner of a graduated launch, when its fee claimer takes it: its share of the migration
    -- fee (flag 0 is the partner's withdrawal; the program checks the sender is the configs' fee claimer), and the
    -- fees of the DAMM v2 liquidity locked for it, in the launched token and USDC.
    partner_income AS (
      SELECT 'migration_fees' AS metric, '${USDC}' AS mint, CAST(fee AS BIGINT) AS amount
      FROM meteora_solana.dynamic_bonding_curve_evt_evtwithdrawmigrationfee
      WHERE pool IN (SELECT pool FROM launches) AND flag = 0 AND ${window("evt_block_time")}
      UNION ALL
      SELECT 'position_fees', g.base_mint, CAST(f.fee_a_claimed AS BIGINT)
      FROM meteora_solana.cp_amm_evt_evtclaimpositionfee f
      JOIN graduated g ON g.pool = f.pool
      WHERE f.owner = '${FEE_CLAIMER}' AND ${window("f.evt_block_time")}
      UNION ALL
      SELECT 'position_fees', '${USDC}', CAST(f.fee_b_claimed AS BIGINT)
      FROM meteora_solana.cp_amm_evt_evtclaimpositionfee f
      JOIN graduated g ON g.pool = f.pool
      WHERE f.owner = '${FEE_CLAIMER}' AND ${window("f.evt_block_time")}
    )
    -- Volume is the curve's only: after graduation it is Meteora DAMM v2's, which lists it.
    SELECT 'volume' AS metric, '${USDC}' AS mint, CAST(SUM(quote_volume) AS VARCHAR) AS amount FROM swaps WHERE market = 'curve'
    UNION ALL
    SELECT 'curve_trading_fees', '${USDC}', CAST(SUM(trading_fee) AS VARCHAR) FROM swaps WHERE market = 'curve'
    UNION ALL
    -- The program rounds the creator's part down; the partner keeps the rest.
    SELECT 'curve_fees_to_creators', '${USDC}', CAST(SUM(s.trading_fee * l.creator_percent / 100) AS VARCHAR)
    FROM swaps s JOIN launches l ON l.pool = s.pool WHERE s.market = 'curve'
    UNION ALL
    SELECT 'curve_protocol_fees', '${USDC}', CAST(SUM(protocol_fee) AS VARCHAR) FROM swaps WHERE market = 'curve'
    UNION ALL
    SELECT 'curve_referral_fees_to_ryntra', '${USDC}', CAST(SUM(referral_fee) AS VARCHAR) FROM swaps WHERE market = 'curve' AND through_ryntra
    UNION ALL
    SELECT 'curve_referral_fees_to_others', '${USDC}', CAST(SUM(referral_fee) AS VARCHAR) FROM swaps WHERE market = 'curve' AND NOT COALESCE(through_ryntra, FALSE)
    UNION ALL
    -- After graduation only Ryntra's own income counts: the referral fee on the trades made through it.
    SELECT 'graduated_referral_fees', '${USDC}', CAST(SUM(referral_fee) AS VARCHAR) FROM swaps WHERE market = 'graduated' AND through_ryntra
    UNION ALL
    SELECT metric, mint, CAST(SUM(amount) AS VARCHAR) FROM partner_income GROUP BY 1, 2
  `;
};

const LABELS = {
  CURVE_FEES: "Bonding Curve Trading Fees",
  GRADUATED_REFERRAL_FEES: "Graduated Pool Referral Fees",
  GRADUATION_FEES: "Graduation Fees",
  POOL_FEES: "Graduated Pool Fees",
  CURVE_TO_RYNTRA: "Bonding Curve Trading Fees To Ryntra",
  CURVE_TO_CREATORS: "Bonding Curve Trading Fees To Creators",
  CURVE_TO_METEORA: "Bonding Curve Trading Fees To Meteora",
  REFERRAL_TO_RYNTRA: "Referral Fees To Ryntra",
  REFERRAL_TO_OTHERS: "Referral Fees To Other Apps",
  GRADUATION_TO_RYNTRA: "Graduation Fees To Ryntra",
  POOL_TO_RYNTRA: "Graduated Pool Fees To Ryntra",
};

const fetch = async (options: FetchOptions) => {
  assertDuneSolanaIndexed(options);
  const rows: { metric: string; mint: string; amount: string | null }[] = await queryDuneSql(options, query(options));
  const total = (metric: string) => BigInt(rows.find((row) => row.metric === metric)?.amount ?? 0);

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyVolume.add(USDC, total("volume"));

  const trading = total("curve_trading_fees");
  const creators = total("curve_fees_to_creators");
  const meteora = total("curve_protocol_fees");
  const referralToRyntra = total("curve_referral_fees_to_ryntra");
  const referralToOthers = total("curve_referral_fees_to_others");
  const curve = trading + meteora + referralToRyntra + referralToOthers;
  dailyFees.add(USDC, curve, LABELS.CURVE_FEES);
  dailyUserFees.add(USDC, curve, LABELS.CURVE_FEES);
  dailyRevenue.add(USDC, trading - creators, LABELS.CURVE_TO_RYNTRA);
  dailyRevenue.add(USDC, referralToRyntra, LABELS.REFERRAL_TO_RYNTRA);
  dailySupplySideRevenue.add(USDC, creators, LABELS.CURVE_TO_CREATORS);
  dailySupplySideRevenue.add(USDC, meteora, LABELS.CURVE_TO_METEORA);
  dailySupplySideRevenue.add(USDC, referralToOthers, LABELS.REFERRAL_TO_OTHERS);

  const graduatedReferral = total("graduated_referral_fees");
  dailyFees.add(USDC, graduatedReferral, LABELS.GRADUATED_REFERRAL_FEES);
  dailyUserFees.add(USDC, graduatedReferral, LABELS.GRADUATED_REFERRAL_FEES);
  dailyRevenue.add(USDC, graduatedReferral, LABELS.REFERRAL_TO_RYNTRA);
  const migration = total("migration_fees");
  dailyFees.add(USDC, migration, LABELS.GRADUATION_FEES);
  dailyRevenue.add(USDC, migration, LABELS.GRADUATION_TO_RYNTRA);
  for (const { metric, mint, amount } of rows) {
    if (metric !== "position_fees" || amount === null) continue;
    dailyFees.add(mint, amount, LABELS.POOL_FEES);
    dailyUserFees.add(mint, amount, LABELS.POOL_FEES);
    dailyRevenue.add(mint, amount, LABELS.POOL_TO_RYNTRA);
  }

  return { dailyVolume, dailyFees, dailyUserFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
};

const methodology = {
  Volume: "The USDC side of every swap on the bonding curves of tokens launched with Ryntra Launch (Meteora DBC pools on its configs, created by its pool payer), from the swap events. Trading after a token graduates is Meteora DAMM v2's volume and is not counted. Double counted: Meteora already lists this volume.",
  Fees: "Everything traders pay on the bonding curves of tokens launched with Ryntra Launch (Meteora DBC pools on its configs, created by its pool payer), including the 20% Meteora keeps; after graduation, the referral fee Meteora pays Ryntra on trades made through Ryntra; and what Ryntra takes as the partner of a graduated curve (its share of the migration fee, and later the fees of the DAMM v2 liquidity locked for it) when its fee claimer withdraws them. The creator's share of the migration fee and the quote above the graduation threshold (not a fee) are not included.",
  UserFees: "What traders pay: the bonding curve fee, the referral fee Ryntra earns on graduated-pool trades and the graduated pool's fees; not the migration fee, which comes out of the curve's reserve.",
  Revenue: "Ryntra's 60% of the configs' share of the bonding curve fee, the referral fees Meteora pays it, and its graduation income when withdrawn.",
  ProtocolRevenue: "Ryntra's 60% of the configs' share of the bonding curve fee, the referral fees Meteora pays it and its graduation income, all of it for the protocol: Ryntra has no token and distributes nothing to holders.",
  SupplySideRevenue: "The token creator's 40% of the configs' share of the bonding curve fee, Meteora's protocol fee, and the referral fees Meteora pays other apps.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.CURVE_FEES]: "The whole fee traders pay on every swap on the bonding curve of a token launched with Ryntra. It starts at 50% (protected config) or 20% (classic) at launch to deter snipers and decays to 1% within minutes, plus a volatility fee. 80% goes to the configs (40% of it to the creator, 60% to Ryntra) and 20% to Meteora, which pays the referral fee out of its part.",
    [LABELS.GRADUATED_REFERRAL_FEES]: "The referral fee Meteora pays Ryntra, out of its protocol fee, on trades made through Ryntra in the pool a launch graduated into.",
    [LABELS.GRADUATION_FEES]: "Ryntra's 60% of a graduating curve's 2% migration fee, when withdrawn by its fee claimer.",
    [LABELS.POOL_FEES]: "Fees of the DAMM v2 liquidity locked for Ryntra after a launch graduates, when claimed, in USDC and in the launched token.",
  },
  UserFees: {
    [LABELS.CURVE_FEES]: "The whole fee traders pay on the bonding curve.",
    [LABELS.GRADUATED_REFERRAL_FEES]: "The referral fee, part of the fee traders pay Meteora in the graduated pool.",
    [LABELS.POOL_FEES]: "Fees traders pay to the DAMM v2 liquidity locked for Ryntra, when claimed.",
  },
  Revenue: {
    [LABELS.CURVE_TO_RYNTRA]: "Ryntra's 60% of the configs' 80% of the bonding curve fee.",
    [LABELS.REFERRAL_TO_RYNTRA]: "The referral fee Meteora pays Ryntra on trades made through it, on the curve and in the graduated pool.",
    [LABELS.GRADUATION_TO_RYNTRA]: "Ryntra's graduation income, when withdrawn.",
    [LABELS.POOL_TO_RYNTRA]: "Claimed fees of the liquidity locked for Ryntra after graduation.",
  },
  ProtocolRevenue: {
    [LABELS.CURVE_TO_RYNTRA]: "Ryntra's 60% of the configs' 80% of the bonding curve fee.",
    [LABELS.REFERRAL_TO_RYNTRA]: "The referral fee Meteora pays Ryntra on trades made through it, on the curve and in the graduated pool.",
    [LABELS.GRADUATION_TO_RYNTRA]: "Ryntra's graduation income, when withdrawn.",
    [LABELS.POOL_TO_RYNTRA]: "Claimed fees of the liquidity locked for Ryntra after graduation.",
  },
  SupplySideRevenue: {
    [LABELS.CURVE_TO_CREATORS]: "The token creator's 40% of the configs' 80% of the bonding curve fee.",
    [LABELS.CURVE_TO_METEORA]: "Meteora's protocol fee: its 20% of the bonding curve fee, less the referral fee it pays.",
    [LABELS.REFERRAL_TO_OTHERS]: "The referral fee Meteora pays other apps on curve trades made through them.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-10-06",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  doublecounted: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
