import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { getUniV3LogAdapter, UniGetRevenueRatioProps } from "../../helpers/uniswap";
import { KALOS_START, KALOS_V3_FACTORY } from "../../aggregators/kalos-trade";

// Kalos DEX (https://www.kalos.fun) on Kinetiq Elysium: the canonical Uniswap V3 contracts, deployed unmodified by Kalos.
// UniswapV3Factory 0x8C60243181370bDA9A7d1a45b1249A8263da0158, created in block 915221 on 2026-11-05
// (https://elysium.kinetiq.xyz/address/0x8C60243181370bDA9A7d1a45b1249A8263da0158). Fee tiers 0.01%, 0.05%, 0.3%, 1%.
// Protocol share: set per pool by setFeeProtocol and read from slot0().feeProtocol (1/N of the swap fee per token).
// Kalos switched it to 5 (20% of the swap fee) on its first pools on 2026-11-09 13:53 UTC (block 3,259,435) and
// collects it to the Kalos revenue splitter 0xcA105395094Ceb27e6AfdA492c6379cBF468CDb8.

const LABELS = {
  SWAP: METRIC.SWAP_FEES,
  SWAP_PROTOCOL: 'Token Swap Fees To Protocol',
  SWAP_LPS: 'Token Swap Fees To LPs',
};

const protocolShareOfPool = ({ protocolFeeRatioToken0, protocolFeeRatioToken1 }: UniGetRevenueRatioProps) => {
  if (protocolFeeRatioToken0 === undefined || protocolFeeRatioToken1 === undefined) throw new Error('kalos-dex: slot0().feeProtocol unreadable');
  const ratio = (protocolFeeRatioToken0 + protocolFeeRatioToken1) / 2;
  return { _revenueRatio: ratio, _protocolRevenueRatio: ratio };
};
const fetchPools = getUniV3LogAdapter({ factory: KALOS_V3_FACTORY, dynamicProtocolFees: true, getRevenueRatio: protocolShareOfPool });

const fetch = async (options: FetchOptions) => {
  const pools = await fetchPools(options);
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  // no pool above the helper's liquidity floor: the helper returns 0 instead of balances
  if (typeof pools.dailyFees === 'object') dailyFees.addBalances(pools.dailyFees, LABELS.SWAP);
  if (typeof pools.dailyRevenue === 'object') dailyRevenue.addBalances(pools.dailyRevenue, LABELS.SWAP_PROTOCOL);
  if (typeof pools.dailySupplySideRevenue === 'object') dailySupplySideRevenue.addBalances(pools.dailySupplySideRevenue, LABELS.SWAP_LPS);
  return {
    dailyVolume: pools.dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ELYSIUM],
  start: KALOS_START,
  methodology: {
    Volume: 'Swap volume of the Kalos DEX pools (Uniswap V3 pools created by the Kalos factory), from their Swap events, counted on one side of each swap.',
    Fees: 'Swap fees paid by traders in Kalos DEX pools, at the pool fee tier.',
    UserFees: 'Swap fees paid by traders in Kalos DEX pools, at the pool fee tier.',
    Revenue: "The protocol share of the swap fees, set per pool (slot0().feeProtocol, 20% where Kalos switched it on), collected to the Kalos revenue splitter.",
    ProtocolRevenue: "The protocol share of the swap fees, set per pool (slot0().feeProtocol, 20% where Kalos switched it on), collected to the Kalos revenue splitter.",
    SupplySideRevenue: 'The rest of the swap fees, earned by liquidity providers.',
  },
  breakdownMethodology: {
    Fees: { [LABELS.SWAP]: 'Swap fees paid by traders in Kalos DEX pools (fee tier 0.01%, 0.05%, 0.3% or 1%).' },
    UserFees: { [LABELS.SWAP]: 'Swap fees paid by traders in Kalos DEX pools (fee tier 0.01%, 0.05%, 0.3% or 1%).' },
    Revenue: { [LABELS.SWAP_PROTOCOL]: 'The protocol share of swap fees (slot0().feeProtocol per pool), collected to the Kalos revenue splitter.' },
    ProtocolRevenue: { [LABELS.SWAP_PROTOCOL]: 'The protocol share of swap fees (slot0().feeProtocol per pool), collected to the Kalos revenue splitter.' },
    SupplySideRevenue: { [LABELS.SWAP_LPS]: 'The part of swap fees earned by liquidity providers.' },
  },
};

export default adapter;
