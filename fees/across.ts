/**
 * Across Adapter
 *
 * Reads Across deposits from the Across API and uses `bridgeFeeUsd` as the relayer fee source of truth.
 * The `/deposits` endpoint only serves the newest ~2000 rows for a destinationChainId filter (skip past the
 * second page returns nothing), so busy destinations cannot be paged back a full day. The deposits are read
 * instead through the bridge adapter's prefetch, which scans every origin chain by block range, and each
 * chain then keeps the filled deposits arriving on it. Fees are attributed to the deposit time.
 */

import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import acrossBridge from "../bridges/across";

interface IAcrossDeposit {
  destinationChainId: number | null;
  status: string;
  bridgeFeeUsd?: string | null;
}

const MIN_VALID_BRIDGE_FEE_USD = 0;

const chainIdConfig: Record<string, number> = {
  [CHAIN.ETHEREUM]: 1,
  [CHAIN.ARBITRUM]: 42161,
  [CHAIN.OPTIMISM]: 10,
  [CHAIN.BOBA]: 288,
  [CHAIN.POLYGON]: 137,
  [CHAIN.ZKSYNC]: 324,
  [CHAIN.BASE]: 8453,
  [CHAIN.LINEA]: 59144,
  [CHAIN.BLAST]: 81457,
  [CHAIN.SCROLL]: 534352,
  [CHAIN.ZORA]: 7777777,
  [CHAIN.WC]: 480,
  [CHAIN.REDSTONE]: 690,
  [CHAIN.LISK]: 1135,
  [CHAIN.SONEIUM]: 1868,
  [CHAIN.INK]: 57073,
  [CHAIN.MODE]: 34443,
  [CHAIN.ALEPH_ZERO_EVM]: 41455,
  [CHAIN.UNICHAIN]: 130,
  [CHAIN.LENS]: 232,
  [CHAIN.SOLANA]: 34268394551451,
  [CHAIN.PLASMA]: 9745,
  [CHAIN.MONAD]: 143,
  [CHAIN.BSC]: 56,
  [CHAIN.ROBINHOOD]: 4663,
};

const parseBridgeFeeUsd = (value?: string | null): number | undefined => {
  if (value == null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  if (parsed < MIN_VALID_BRIDGE_FEE_USD) return undefined;
  return parsed;
};

const fetch = async (options: FetchOptions) => {
  const deposits = options.preFetchedResults as IAcrossDeposit[];
  const chainId = chainIdConfig[options.chain];
  let relayFees = 0;
  let filled = 0;
  let priced = 0;
  for (const deposit of deposits) {
    if (deposit.destinationChainId !== chainId || deposit.status !== "filled") continue;
    filled++;
    if (deposit.bridgeFeeUsd != null) priced++;
    const bridgeFeeUsd = parseBridgeFeeUsd(deposit.bridgeFeeUsd);
    if (bridgeFeeUsd !== undefined) relayFees += bridgeFeeUsd;
  }
  // the shared prefetch must keep the raw API rows, a missing bridgeFeeUsd on every fill would store a fake 0
  if (filled > 0 && priced === 0) throw new Error(`across: ${filled} fills on ${options.chain} without bridgeFeeUsd`);

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(relayFees, 'Relayer Fees');
  dailyFees.addUSDValue(0, 'LP Fees');
  dailySupplySideRevenue.addUSDValue(relayFees, 'Relayer Fees');
  dailySupplySideRevenue.addUSDValue(0, 'LP Fees');

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: "Total fees paid by users for bridge txs.",
  Revenue: "Protocol revenue is 0.",
  ProtocolRevenue: "Across takes 0% fees paid by users.",
  SupplySideRevenue: "Total fees paid by users are distributed to liquidity providers and relayers.",
}

const breakdownMethodology = {
  Fees: {
    'Relayer Fees': 'Fees paid to relayers who execute cross-chain bridge transactions on the destination chain',
    'LP Fees': 'Fees paid to liquidity providers who supply capital for cross-chain transfers',
  },
  SupplySideRevenue: {
    'Relayer Fees': 'Fees paid to relayers who execute cross-chain bridge transactions on the destination chain',
    'LP Fees': 'Fees paid to liquidity providers who supply capital for cross-chain transfers',
  },
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { start: "2024-02-21" },
    [CHAIN.ARBITRUM]: { start: "2024-02-21" },
    [CHAIN.OPTIMISM]: { start: "2024-02-21" },
    [CHAIN.BOBA]: { start: "2022-05-05" },
    [CHAIN.POLYGON]: { start: "2024-02-21" },
    [CHAIN.ZKSYNC]: { start: "2024-02-21" },
    [CHAIN.BASE]: { start: "2024-02-21" },
    [CHAIN.LINEA]: { start: "2024-03-20" },
    [CHAIN.BLAST]: { start: "2024-07-10", deadFrom: "2026-08-01" }, // last Across deposit from or to Blast was 2026-07-31
    [CHAIN.SCROLL]: { start: "2024-07-31" },
    [CHAIN.ZORA]: { start: "2024-08-15" },
    [CHAIN.WC]: { start: "2024-10-10" },
    [CHAIN.REDSTONE]: { start: "2024-08-12" },
    [CHAIN.LISK]: { start: "2024-07-04", deadFrom: "2026-08-18" }, // last Across deposit from or to Lisk was 2026-08-17
    [CHAIN.SONEIUM]: { start: "2025-01-14" },
    [CHAIN.INK]: { start: "2025-01-02" },
    [CHAIN.MODE]: { start: "2024-05-23" },
    [CHAIN.ALEPH_ZERO_EVM]: { start: "2024-11-16" },
    [CHAIN.UNICHAIN]: { start: "2025-02-06" },
    [CHAIN.LENS]: { start: "2025-03-28" },
    [CHAIN.SOLANA]: { start: "2025-07-04" },
    [CHAIN.PLASMA]: { start: "2025-09-23" },
    [CHAIN.MONAD]: { start: "2025-11-20" },
    [CHAIN.BSC]: { start: "2025-05-05" },
    [CHAIN.ROBINHOOD]: { start: "2026-07-02" },
  },
  fetch,
  prefetch: acrossBridge.prefetch,
  methodology,
  breakdownMethodology,
  pullHourly: false, // one prefetch scans every origin chain by block range, hourly windows would multiply the calls against a rate-limited API
  allowNegativeValue: true, // Gas Fee cost be higher than estimated
};

export default adapter;
