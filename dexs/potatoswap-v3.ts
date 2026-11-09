import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { getConfig } from '../helpers/cache';
import { CHAIN } from '../helpers/chains';
import { getUniV3LogAdapter, UniGetRevenueRatioProps } from '../helpers/uniswap';

const methodology = {
  Fees: "Total fees paid by users on every swap, determined by the pool's fee tier (e.g., 0.01%, 0.05%, 0.30%, 1.00%).",
  UserFees: "Total fees paid by users (same as Fees).",
  Revenue: "Protocol revenue represents the share of swap fees diverted to the protocol. This share is set on a per-pool basis and can be updated by governance. Default share is 0%.",
  ProtocolRevenue: "Calculated per-pool. feeProtocol is a uint8 containing two uint4 values: feeProtocol0 (lower 4 bits) and feeProtocol1 (upper 4 bits). If feeProtocol0 = x1 and feeProtocol1 = x2, protocol revenue = Total Fees * (1/x1 + 1/x2) / 2. If only one is set, protocol revenue = Total Fees * 1/x.",
  SupplySideRevenue: "The portion of swap fees distributed to Liquidity Providers (LPs). This is (Total Fees - Protocol Revenue) for each pool.",
};

// Labels kept identical to the ones getUniV3LogAdapter emits.
const LABELS = {
  SwapFees: 'Token Swap Fees',
  TradingFees: 'Trading fees',
  ProtocolFees: 'Protocol fees',
  LPFees: 'LP fees',
}

const breakdownMethodology = {
  Fees: {
    [LABELS.SwapFees]: "Swap fees paid by users, per the pool's fee tier.",
  },
  UserFees: {
    [LABELS.TradingFees]: "Swap fees paid by users (same as Fees).",
  },
  Revenue: {
    [LABELS.ProtocolFees]: "Per-pool protocol share of swap fees (from on-chain feeProtocol).",
  },
  ProtocolRevenue: {
    [LABELS.ProtocolFees]: "Per-pool protocol share of swap fees (from on-chain feeProtocol).",
  },
  SupplySideRevenue: {
    [LABELS.LPFees]: "Swap fees distributed to liquidity providers (Total Fees - Protocol Revenue).",
  },
};

async function fetch(options: FetchOptions) {
  const { data } = await getConfig('potatoswap-v3-xlayer', 'https://potatoswap.finance/api/pool/list-all?keyword=&protocol_version=v3')
  const pools = data.pools.map((i: any) => i.address);

  return getUniV3LogAdapter({
    pools,
    userFeesRatio: 1,
    // Read each pool's live on-chain feeProtocol (slot0) instead of a fixed
    // ratio, matching the methodology documented above - this is the exact
    // computation the removed "recent day" branch used to do by hand via a
    // manual slot0 multiCall.
    dynamicProtocolFees: true,
    getRevenueRatio: ({ protocolFeeRatioToken0 = 0, protocolFeeRatioToken1 = 0 }: UniGetRevenueRatioProps) => {
      // feeProtocol0/feeProtocol1 = 0 means "no protocol fee on that token".
      // Average the two sides only when BOTH are set; use the lone side
      // as-is (not halved) when only one is - matches the ProtocolRevenue
      // methodology text above exactly.
      let _protocolRevenueRatio = 0;
      if (protocolFeeRatioToken0 > 0 && protocolFeeRatioToken1 > 0) {
        _protocolRevenueRatio = (protocolFeeRatioToken0 + protocolFeeRatioToken1) / 2;
      } else if (protocolFeeRatioToken0 > 0) {
        _protocolRevenueRatio = protocolFeeRatioToken0;
      } else if (protocolFeeRatioToken1 > 0) {
        _protocolRevenueRatio = protocolFeeRatioToken1;
      }
      // "Revenue" and "ProtocolRevenue" are the same figure here (the
      // protocol's whole cut) - no separate token-holder split, matching
      // the original recent-day computation this replaces.
      return { _revenueRatio: _protocolRevenueRatio, _protocolRevenueRatio };
    },
  })(options)
}

const adapter: SimpleAdapter = {
  // v2: fees/volume are now exclusively on-chain event logs (the API is only
  // used for pool-address discovery), matching this repo's version-2 criteria.
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  fetch,
  chains: [CHAIN.XLAYER],
  start: '2025-10-20',
};

export default adapter;
