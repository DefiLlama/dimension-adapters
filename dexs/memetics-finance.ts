// Memetics Finance: a fork of Raydium cp-swap. Source: https://github.com/fomotsar-commits/tegridy-farms/tree/mvp-launch/solana/tegridy-amm
import ADDRESSES from "../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";
import { METRIC } from "../helpers/metrics";
import { addOneToken } from "../helpers/prices";
import { base58Encode, getProgramAccounts } from "../helpers/solana";
import { assertComplete, programEventsSql, timeFilter, u64 } from "../helpers/alliumSolanaEvents";

const PROGRAM = "EKS4C6xvV9A5DMWaWtVnFvi7ru78EhqRAoddEMpQ2BtT";
// treasury multisig's wSOL account that receives the pool creation fee
const POOL_CREATION_FEE_ACCOUNT = "2sa31zceMSTAAbSu5wfSnNA6sBYzS7r97nvZYaQouEXa";
const SWAP_EVENT = "40C6CDE8260871E2";
const POOL_STATE_SIZE = 637;
const AMM_CONFIG_SIZE = 236;
const RATE_DENOMINATOR = 1e6;
// fund_fee_rate was 0 (its share went to the protocol) until tx 3v8upWGzBvmfsC9nnGpV8CLFhzCnbaDoMsQM3hzupT68k4aqqhnrCQgo5V1bu5bhDdTSADPLA2NKdtm9RJf78yje
const FUND_SHARE_START = 1792396734; // 2026-10-19 07:58:54 UTC

const LABEL = {
  SwapFees: METRIC.SWAP_FEES,
  PoolCreationFees: "Pool Creation Fees",
  SwapFeesToLps: "Swap Fees To LPs",
  SwapFeesToFundOwner: "Swap Fees To Fund Owner",
  SwapFeesToTreasury: "Swap Fees To Treasury",
  PoolCreationFeesToTreasury: "Pool Creation Fees To Treasury",
};

type FeeShares = { protocol: number; fund: number };
let feeSharesByPool: Promise<Map<string, FeeShares>> | undefined;

// AmmConfig protocol_fee_rate @20, fund_fee_rate @28; PoolState amm_config @8
async function readFeeSharesByPool(): Promise<Map<string, FeeShares>> {
  const [tiers, pools] = await Promise.all([
    getProgramAccounts({ programId: PROGRAM, encoding: "base64", filters: [{ dataSize: AMM_CONFIG_SIZE }], dataSlice: { offset: 20, length: 16 } }),
    getProgramAccounts({ programId: PROGRAM, encoding: "base64", filters: [{ dataSize: POOL_STATE_SIZE }], dataSlice: { offset: 8, length: 32 } }),
  ]);
  const data = (account: any) => Buffer.from(account.data[0], "base64");
  const sharesByTier = new Map<string, FeeShares>(tiers.map((t) => {
    const d = data(t.account);
    return [t.pubkey, { protocol: Number(d.readBigUInt64LE(0)) / RATE_DENOMINATOR, fund: Number(d.readBigUInt64LE(8)) / RATE_DENOMINATOR }];
  }));
  return new Map(pools.map((p) => [p.pubkey, sharesByTier.get(base58Encode(data(p.account)))!]));
}

const fetch = async (options: FetchOptions) => {
  const rows = await queryAllium(`${programEventsSql(PROGRAM, options)},
  swaps AS (
    -- SwapEvent: pool_id @8 | input_amount u64 @56 | output_amount u64 @64 | input_mint @89 | output_mint @121 | trade_fee u64 @153
    SELECT SUBSTR(data, 17, 64) AS pool, SUBSTR(data, 179, 64) AS input_mint, SUBSTR(data, 243, 64) AS output_mint,
      ${u64("data", 56)} AS amount_in, ${u64("data", 64)} AS amount_out, ${u64("data", 153)} AS trade_fee
    FROM program_events
    WHERE STARTSWITH(data, '${SWAP_EVENT}')
  ),
  swap_totals AS (
    SELECT pool, input_mint, output_mint,
      SUM(amount_in)::VARCHAR AS amount_in, SUM(amount_out)::VARCHAR AS amount_out, SUM(trade_fee)::VARCHAR AS trade_fee
    FROM swaps
    -- the protocol's keeper bot swaps fee-free; every user swap pays at least one unit
    WHERE trade_fee > 0
    GROUP BY pool, input_mint, output_mint
  ),
  totals AS (
    SELECT checks.*,
      (SELECT SUM(raw_amount) FROM solana.assets.transfers
        WHERE ${timeFilter(options)} AND transfer_type = 'sol_transfer' AND type = 'transfer'
          AND to_address = '${POOL_CREATION_FEE_ACCOUNT}' AND txn_id IN (SELECT txn_id FROM program_txs))::VARCHAR AS pool_creation_fees
    FROM checks
  )
  SELECT totals.*, swap_totals.*
  FROM totals
  LEFT JOIN swap_totals ON TRUE`);
  const [row] = rows;
  assertComplete(row, "memetics-finance", options);

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const fundOwnerPaid = options.startTimestamp >= FUND_SHARE_START;

  for (const { pool, input_mint, output_mint, amount_in, amount_out, trade_fee } of rows) {
    if (!pool) continue;
    if (!feeSharesByPool) feeSharesByPool = readFeeSharesByPool();
    const shares = (await feeSharesByPool).get(base58Encode(Buffer.from(pool, "hex")));
    if (!shares) throw new Error(`memetics-finance: no fee tier for pool ${pool}`);

    const tokenIn = base58Encode(Buffer.from(input_mint, "hex"));
    const tokenOut = base58Encode(Buffer.from(output_mint, "hex"));
    const amountIn = Number(amount_in);
    const tradeFee = Number(trade_fee);
    const price = Number(amount_out) / (amountIn - tradeFee);
    const add = (balances: any, amount: number, label?: string) =>
      addOneToken({ balances, token0: tokenIn, amount0: amount, token1: tokenOut, amount1: amount * price, label });

    const protocolShare = fundOwnerPaid ? shares.protocol : shares.protocol + shares.fund;
    const fundShare = fundOwnerPaid ? shares.fund : 0;
    add(dailyVolume, amountIn);
    add(dailyFees, tradeFee, LABEL.SwapFees);
    add(dailyRevenue, tradeFee * protocolShare, LABEL.SwapFeesToTreasury);
    add(dailySupplySideRevenue, tradeFee * fundShare, LABEL.SwapFeesToFundOwner);
    add(dailySupplySideRevenue, tradeFee * (1 - protocolShare - fundShare), LABEL.SwapFeesToLps);
  }
  dailyFees.add(ADDRESSES.solana.SOL, row.pool_creation_fees ?? 0, LABEL.PoolCreationFees);
  dailyRevenue.add(ADDRESSES.solana.SOL, row.pool_creation_fees ?? 0, LABEL.PoolCreationFeesToTreasury);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Amount sent into every swap in Memetics Finance pools, before fees. Fee-free swaps by the protocol's own keeper bot are excluded.",
  Fees: "The 1% trade fee paid on every swap and the 0.15 SOL fee to open a pool.",
  Revenue: "10.4% of each trade fee (16% before 19 October 2026) and the pool creation fee, both kept by the protocol's multisig treasury.",
  ProtocolRevenue: "10.4% of each trade fee (16% before 19 October 2026) and the pool creation fee, both kept by the protocol's multisig treasury.",
  SupplySideRevenue: "84% of each trade fee, left in the pool for liquidity providers, and 5.6% of each trade fee since 19 October 2026, paid to the fund owner, a community wallet the protocol shares fees with.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.SwapFees]: "The 1% trade fee paid on every swap, charged in the token swapped in.",
    [LABEL.PoolCreationFees]: "The 0.15 SOL fee to open a pool.",
  },
  Revenue: {
    [LABEL.SwapFeesToTreasury]: "10.4% of each trade fee (16% before 19 October 2026), kept by the protocol's multisig treasury.",
    [LABEL.PoolCreationFeesToTreasury]: "The 0.15 SOL fee to open a pool, paid to the protocol's multisig treasury.",
  },
  ProtocolRevenue: {
    [LABEL.SwapFeesToTreasury]: "10.4% of each trade fee (16% before 19 October 2026), kept by the protocol's multisig treasury.",
    [LABEL.PoolCreationFeesToTreasury]: "The 0.15 SOL fee to open a pool, paid to the protocol's multisig treasury.",
  },
  SupplySideRevenue: {
    [LABEL.SwapFeesToLps]: "84% of each trade fee, left in the pool for liquidity providers.",
    [LABEL.SwapFeesToFundOwner]: "5.6% of each trade fee since 19 October 2026, paid to the fund owner, a community wallet the protocol shares fees with.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-10-03",
  dependencies: [Dependencies.ALLIUM],
  methodology,
  breakdownMethodology,
};

export default adapter;
