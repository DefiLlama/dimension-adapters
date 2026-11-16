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
  id: number;
  destinationChainId: number | null;
  status: string;
  bridgeFeeUsd?: string | number | null;
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
  [CHAIN.BOBA]: { chainId: 288, start: "2022-05-05" },
  [CHAIN.POLYGON]: { chainId: 137, start: "2024-02-21" },
  [CHAIN.ZKSYNC]: { chainId: 324, start: "2024-02-21" },
  [CHAIN.BASE]: { chainId: 8453, start: "2024-02-21" },
  [CHAIN.LINEA]: { chainId: 59144, start: "2024-03-20" },
  [CHAIN.BLAST]: { chainId: 81457, start: "2024-07-10", deadFrom: "2026-08-01" }, // last Across deposit from or to Blast was 2026-07-31
  [CHAIN.SCROLL]: { chainId: 534352, start: "2024-07-31" },
  [CHAIN.ZORA]: { chainId: 7777777, start: "2024-08-15" },
  [CHAIN.WC]: { chainId: 480, start: "2024-10-10" },
  [CHAIN.REDSTONE]: { chainId: 690, start: "2024-08-12" },
  [CHAIN.LISK]: { chainId: 1135, start: "2024-07-04", deadFrom: "2026-08-18" }, // last Across deposit from or to Lisk was 2026-08-17
  [CHAIN.SONEIUM]: { chainId: 1868, start: "2025-01-14" },
  [CHAIN.INK]: { chainId: 57073, start: "2025-01-02" },
  [CHAIN.MODE]: { chainId: 34443, start: "2024-05-23" },
  [CHAIN.ALEPH_ZERO_EVM]: { chainId: 41455, start: "2024-11-16" },
  [CHAIN.UNICHAIN]: { chainId: 130, start: "2025-02-06" },
  [CHAIN.LENS]: { chainId: 232, start: "2025-03-28" },
  [CHAIN.SOLANA]: { chainId: 34268394551451, start: "2025-07-04" },
  [CHAIN.PLASMA]: { chainId: 9745, start: "2025-09-23" },
  [CHAIN.MONAD]: { chainId: 143, start: "2025-11-20" },
  [CHAIN.BSC]: { chainId: 56, start: "2025-05-05" },
  [CHAIN.ROBINHOOD]: { chainId: 4663, start: "2026-07-02" },
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

// The indexer leaves bridgeFeeUsd null on fills it cannot price (seen on USDT0 and USDG routes, where the fee is
// a flat spread or none). Its priced rows are exactly inputUsd - outputUsd, so the fee is then the input minus
// output amount, booked in the output token. Equal amounts mean no fee. A spread over half the input means the
// legs do not share decimals: that one fill is skipped and logged, since it cannot be priced and the indexer
// never backfills it.
const getUnpricedFee = (deposit: IAcrossDeposit, chain: string): bigint => {
  if (!deposit.inputAmount || !deposit.outputAmount || !deposit.outputToken)
    throw new Error(`across: unpriced fill ${deposit.id} on ${chain} has no amounts`);
  const input = BigInt(deposit.inputAmount);
  const spread = input - BigInt(deposit.outputAmount);
  const absSpread = spread < 0n ? -spread : spread;
  if (absSpread * 2n > input) {
    console.log(`across: skipping unpriced fill ${deposit.id} on ${chain}, input ${deposit.inputAmount} vs output ${deposit.outputAmount}`);
    return 0n;
  }
  return spread;
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
      if (spread <= 0n) continue;
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
  adapter: chainConfig,
  fetch,
  prefetch: acrossBridge.prefetch,
  methodology,
  breakdownMethodology,
  pullHourly: false, // one prefetch scans every origin chain by block range, hourly windows would multiply the calls against a rate-limited API
  allowNegativeValue: true, // Gas Fee cost be higher than estimated
};

export default adapter;
