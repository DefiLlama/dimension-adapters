/**
 * Across Adapter
 *
 * Reads Across deposits from the Across API and uses `bridgeFeeUsd` as the relayer fee source of truth.
 * The `/deposits` endpoint only serves the newest ~2000 rows for a destinationChainId filter (skip past the
 * second page returns nothing), so busy destinations cannot be paged back a full day. The deposits are read
 * instead through the shared prefetch in helpers/across.ts (also used by bridges/across.ts), which scans every
 * origin chain by block range, and each chain then keeps the filled deposits arriving on it. Fees are
 * attributed to the deposit time.
 */

import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { prefetchAcrossDeposits } from "../helpers/across";
import coreAssets from "../helpers/coreAssets.json";

interface IAcrossDeposit {
  id: number;
  originChainId?: number;
  destinationChainId: number | null;
  status: string;
  bridgeFeeUsd?: string | number | null;
  inputToken?: string;
  inputAmount?: string;
  outputToken?: string;
  outputAmount?: string;
}

const MIN_VALID_BRIDGE_FEE_USD = 0;

interface IChainConfig {
  chainId: number; // Across destination chain id
  start: string;
  deadFrom?: string;
}

const chainConfig: Record<string, IChainConfig> = {
  [CHAIN.ETHEREUM]: { chainId: 1, start: "2024-02-21" },
  [CHAIN.ARBITRUM]: { chainId: 42161, start: "2024-02-21" },
  [CHAIN.OPTIMISM]: { chainId: 10, start: "2024-02-21" },
  // [CHAIN.BOBA]: { chainId: 288, start: "2022-05-05" }, // the Across API has no deposits to Boba at all; every stored day was $0
  [CHAIN.POLYGON]: { chainId: 137, start: "2024-02-21" },
  // [CHAIN.ZKSYNC]: { chainId: 324, start: "2024-02-21" }, // 324 is ZKsync Era, not ZKsync Lite; the sdk lists zksync as dead so the runner skipped it (stored series stops 2026-05-14)
  [CHAIN.ERA]: { chainId: 324, start: "2024-02-21" },
  [CHAIN.BASE]: { chainId: 8453, start: "2024-02-21" },
  [CHAIN.LINEA]: { chainId: 59144, start: "2024-03-20" },
  [CHAIN.BLAST]: { chainId: 81457, start: "2024-07-10", deadFrom: "2026-08-01" }, // last Across deposit from or to Blast was 2026-07-31
  [CHAIN.SCROLL]: { chainId: 534352, start: "2024-07-31" },
  [CHAIN.ZORA]: { chainId: 7777777, start: "2024-08-15" },
  [CHAIN.WC]: { chainId: 480, start: "2024-10-10" },
  [CHAIN.REDSTONE]: { chainId: 690, start: "2024-08-12", deadFrom: "2025-12-09" }, // last filled Across deposit to Redstone was 2025-12-08, later ones expired
  [CHAIN.LISK]: { chainId: 1135, start: "2024-07-04", deadFrom: "2026-08-18" }, // last Across deposit from or to Lisk was 2026-08-17
  [CHAIN.SONEIUM]: { chainId: 1868, start: "2025-01-14" },
  [CHAIN.INK]: { chainId: 57073, start: "2025-01-02" },
  [CHAIN.MODE]: { chainId: 34443, start: "2024-05-23" },
  [CHAIN.ALEPH_ZERO_EVM]: { chainId: 41455, start: "2024-11-16", deadFrom: "2025-08-23" }, // last filled Across deposit to Aleph Zero was 2025-08-22
  [CHAIN.UNICHAIN]: { chainId: 130, start: "2025-02-06" },
  [CHAIN.LENS]: { chainId: 232, start: "2025-03-28" },
  [CHAIN.SOLANA]: { chainId: 34268394551451, start: "2025-07-04" },
  [CHAIN.PLASMA]: { chainId: 9745, start: "2025-09-23" },
  [CHAIN.MONAD]: { chainId: 143, start: "2025-11-20" },
  [CHAIN.BSC]: { chainId: 56, start: "2025-05-05" },
  [CHAIN.ROBINHOOD]: { chainId: 4663, start: "2026-07-02" },
  // starts below are the first filled deposit to the chain in the Across API, paged per origin chain
  [CHAIN.HYPERLIQUID]: { chainId: 999, start: "2025-09-16" },
  [CHAIN.MEGAETH]: { chainId: 4326, start: "2026-01-16" },
  [CHAIN.ARC]: { chainId: 5042, start: "2026-09-14" },
  [CHAIN.TEMPO]: { chainId: 4217, start: "2026-03-17" },
  [CHAIN.TRON]: { chainId: 728126428, start: "2026-04-13" },
};

// Returns the USD fee of a fill, or null when the indexer left it unpriced. A value that is present but not a
// number throws, so a schema change cannot turn into a silent zero.
const parseBridgeFeeUsd = (deposit: IAcrossDeposit, chain: string): number | null => {
  const value = deposit.bridgeFeeUsd;
  if (value === null) return null;
  const parsed = typeof value === "number" || (typeof value === "string" && value.trim() !== "") ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) throw new Error(`across: fill ${deposit.id} on ${chain} has an invalid bridgeFeeUsd ${JSON.stringify(value)}`);
  return parsed;
};

// Only these directional pairs have verified same-underlying, 6-decimal legs for raw subtraction.
const unpricedFeePairs = [
  // USDG issuer deployments: https://docs.paxos.com/guides/stablecoin/usdg/mainnet
  // 6 decimals: https://github.com/paxosglobal/usdg-contract/blob/master/contracts/USDG.sol
  { originChainId: 1, inputToken: coreAssets.ethereum.USDG, destinationChainId: 4663, outputToken: coreAssets.robinhood.USDG },
  // USDT0 deployments: https://docs.usdt0.to/technical-documentation/deployments
  // Both use 6 decimals; USDT0 is redeemable 1:1 for Ethereum USDT: https://docs.usdt0.to/
  { originChainId: 10, inputToken: "0x01bFF41798a0BcF287b996046Ca68b395DbC1071", destinationChainId: 9745, outputToken: coreAssets.plasma.USDT0 },
  // Optimism USDT0 above -> bridged USDT: https://docs.soneium.org/docs/builders/contracts
  // Soneium USDT decimals() = 6 and remoteToken() = Ethereum USDT at sample fill block 30745714.
  { originChainId: 10, inputToken: "0x01bFF41798a0BcF287b996046Ca68b395DbC1071", destinationChainId: 1868, outputToken: coreAssets.soneium.USDT },
];

// A null USD fee needs verified token identity before even equal raw amounts can establish a zero fee.
// Returns null for a pair outside the allowlist: its fee cannot be verified, so it is left out (and logged)
// rather than failing the whole destination chain on every rerun of that day.
const getUnpricedFee = (deposit: IAcrossDeposit, chain: string): bigint | null => {
  const context = `across: unpriced fill ${deposit.id} on ${chain} (${deposit.originChainId}:${deposit.inputToken} -> ${deposit.destinationChainId}:${deposit.outputToken})`;
  const verifiedPair = unpricedFeePairs.some(pair =>
    deposit.originChainId === pair.originChainId && deposit.destinationChainId === pair.destinationChainId &&
    typeof deposit.inputToken === "string" && deposit.inputToken.toLowerCase() === pair.inputToken.toLowerCase() &&
    typeof deposit.outputToken === "string" && deposit.outputToken.toLowerCase() === pair.outputToken.toLowerCase()
  );
  if (!verifiedPair) {
    console.log(`${context} has an unverified token pair, fee left out`);
    return null;
  }
  if (typeof deposit.inputAmount !== "string" || !/^[0-9]+$/.test(deposit.inputAmount) ||
      typeof deposit.outputAmount !== "string" || !/^[0-9]+$/.test(deposit.outputAmount))
    throw new Error(`${context} has invalid amounts (expected unsigned base-10 integer strings)`);
  return BigInt(deposit.inputAmount) - BigInt(deposit.outputAmount);
};

const fetch = async (options: FetchOptions) => {
  const deposits = options.preFetchedResults as IAcrossDeposit[];
  const { chainId } = chainConfig[options.chain];
  let relayFees = 0;
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  for (const deposit of deposits) {
    if (deposit.destinationChainId !== chainId || deposit.status !== "filled") continue;
    const bridgeFeeUsd = parseBridgeFeeUsd(deposit, options.chain);
    if (bridgeFeeUsd === null) {
      const spread = getUnpricedFee(deposit, options.chain);
      if (spread === null || spread <= 0n) continue;
      dailyFees.add(deposit.outputToken!, spread.toString(), 'Relayer Fees');
      dailySupplySideRevenue.add(deposit.outputToken!, spread.toString(), 'Relayer Fees');
    } else if (bridgeFeeUsd >= MIN_VALID_BRIDGE_FEE_USD) relayFees += bridgeFeeUsd;
  }

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
  Fees: "Total fees paid by users for bridge txs, counted on the destination chain at the time of the deposit.",
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

// version 1, rate limited API
const adapter: Adapter = {
  version: 1,
  adapter: chainConfig,
  fetch,
  prefetch: prefetchAcrossDeposits as any,
  methodology,
  breakdownMethodology,
};

export default adapter;
