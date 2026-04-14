/**
 * Across Adapter
 * 
 * This implementation reads Across deposits directly from the Across API and
 * uses `bridgeFeeUsd` as the relayer fee source of truth.
 */

import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

interface IResponse {
  dst_chain: string;
  relay_fees: number;
  lp_fees: number;
}

interface IAcrossDeposit {
  bridgeFeeUsd?: string | null;
  fillBlockTimestamp?: string;
  depositBlockTimestamp?: string;
}

const ACROSS_DEPOSITS_API = "https://app.across.to/api/deposits";
const PAGE_LIMIT = 1000;
const MAX_PAGES_PER_CHAIN = 200;
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
};

const parseBridgeFeeUsd = (value?: string | null): number | undefined => {
  if (value == null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  if (parsed < MIN_VALID_BRIDGE_FEE_USD) return undefined;
  return parsed;
};

const parseTimestamp = (deposit: IAcrossDeposit): number | undefined => {
  const raw = deposit.fillBlockTimestamp ?? deposit.depositBlockTimestamp;
  if (!raw) return undefined;
  const timestamp = Math.floor(new Date(raw).getTime() / 1000);
  if (!Number.isFinite(timestamp)) return undefined;
  return timestamp;
};

const fetchBridgeFeesForChain = async (destinationChainId: number, startTimestamp: number, endTimestamp: number) => {
  let skip = 0;
  let pagesFetched = 0;
  let totalBridgeFeesUsd = 0;

  while (pagesFetched < MAX_PAGES_PER_CHAIN) {
    const queryParams = new URLSearchParams({
      destinationChainId: String(destinationChainId),
      status: "filled",
      limit: String(PAGE_LIMIT),
      skip: String(skip),
    });
    const deposits: IAcrossDeposit[] = await fetchURL(`${ACROSS_DEPOSITS_API}?${queryParams.toString()}`);
    if (!Array.isArray(deposits) || !deposits.length) break;

    let reachedOlderData = false;
    for (const deposit of deposits) {
      const timestamp = parseTimestamp(deposit);
      if (timestamp === undefined) continue;
      if (timestamp >= endTimestamp) continue;
      if (timestamp < startTimestamp) {
        reachedOlderData = true;
        continue;
      }
      const bridgeFeeUsd = parseBridgeFeeUsd(deposit.bridgeFeeUsd);
      if (bridgeFeeUsd !== undefined) totalBridgeFeesUsd += bridgeFeeUsd;
    }

    if (reachedOlderData || deposits.length < PAGE_LIMIT) break;

    skip += PAGE_LIMIT;
    pagesFetched += 1;
  }

  return totalBridgeFeesUsd;
};

// Prefetch function that will run once before any fetch calls
const prefetch = async (options: FetchOptions): Promise<any> => {
  const results: IResponse[] = [];

  for (const [dst_chain, destinationChainId] of Object.entries(chainIdConfig)) {
    let relay_fees = 0;
    try {
      relay_fees = await fetchBridgeFeesForChain(destinationChainId, options.startTimestamp, options.endTimestamp);
    } catch (error) {
      console.error(`[across][prefetch] failed chain=${dst_chain} chainId=${destinationChainId}`, error);
    }
    results.push({
      dst_chain,
      relay_fees,
      lp_fees: 0,
    });
  }

  return results as any;
};

const fetch = async (options: FetchOptions) => {
  const results: IResponse[] = options.preFetchedResults || [];
  const chainData = results.find(item => item.dst_chain === options.chain);

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  if (chainData) {
    dailyFees.addUSDValue(chainData.relay_fees, 'Relayer Fees');
    dailyFees.addUSDValue(chainData.lp_fees, 'LP Fees');
    dailySupplySideRevenue.addUSDValue(chainData.relay_fees, 'Relayer Fees');
    dailySupplySideRevenue.addUSDValue(chainData.lp_fees, 'LP Fees');
  }

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
    [CHAIN.BLAST]: { start: "2024-07-10" },
    [CHAIN.SCROLL]: { start: "2024-07-31" },
    [CHAIN.ZORA]: { start: "2024-08-15" },
    [CHAIN.WC]: { start: "2024-10-10" },
    [CHAIN.REDSTONE]: { start: "2024-08-12" },
    [CHAIN.LISK]: { start: "2024-07-04" },
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
  },
  fetch,
  prefetch: prefetch as any,
  methodology,
  breakdownMethodology,
  allowNegativeValue: true, // Gas Fee cost be higher than estimated
  runAtCurrTime: true, // API doesnt provide sufficient data for historic refill
};

export default adapter;
