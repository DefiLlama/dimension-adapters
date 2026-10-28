import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";

// Kodiak V2 swap fees split: ~83.33% to LPs, ~16.67% kept by the protocol as revenue.
// Same tokenomics buckets as Kodiak V3 (labels shared), only the revenue share differs.
const REVENUE_RATIO = 0.1667;
const LP_RATIO = 1 - REVENUE_RATIO;

// From 2026-01-01 the protocol revenue is allocated: 60% KDK buyback, 30% POL, 10% treasury.
const REVAMP_TIMESTAMP = 1767225600; // 2026-01-01 00:00 UTC

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.BERACHAIN],
  start: '2025-02-06',
  fetch: async (options: FetchOptions) => {
    const graphFetch = getUniV2LogAdapter({
      factory: '0x5e705e184d233ff2a7cb1553793464a9d0c3028f',
    })
    const result = await graphFetch(options);

    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailyHoldersRevenue = options.createBalances();

    dailyFees.addBalances(result.dailyFees, 'Swap Fees');
    dailySupplySideRevenue.addBalances(result.dailyFees.clone(LP_RATIO), 'Swap Fees To LPs');
    dailyRevenue.addBalances(result.dailyFees.clone(REVENUE_RATIO), 'Swap Fees Collected As Revenue');

    if (options.startOfDay >= REVAMP_TIMESTAMP) {
      dailyHoldersRevenue.addBalances(result.dailyFees.clone(REVENUE_RATIO * 0.6), 'KDK Buyback');
      dailyProtocolRevenue.addBalances(result.dailyFees.clone(REVENUE_RATIO * 0.3), 'Swap Fees To Protocol-Owned Liquidity');
      dailyProtocolRevenue.addBalances(result.dailyFees.clone(REVENUE_RATIO * 0.1), 'Swap Fees To Treasury');
    } else {
      dailyProtocolRevenue.addBalances(result.dailyFees.clone(REVENUE_RATIO), 'Swap Fees To Protocol');
    }

    return {
      dailyVolume: result.dailyVolume,
      dailyFees,
      dailyUserFees: dailyFees,
      dailyRevenue,
      dailySupplySideRevenue,
      dailyProtocolRevenue,
      dailyHoldersRevenue,
    }
  },
  methodology: {
    Fees: 'Swap fees paid by traders on Kodiak V2 pools.',
    UserFees: 'Swap fees paid by traders.',
    Revenue: 'The ~16.67% of swap fees the protocol keeps. The other ~83.33% is paid to liquidity providers.',
    SupplySideRevenue: '~83.33% of swap fees paid to liquidity providers.',
    ProtocolRevenue: 'The protocol\'s share of the ~16.67% revenue that it retains. Before 2026-01-01 the protocol kept the full share. From 2026-01-01 the protocol retains 40% of that revenue (10% to the treasury and 30% deployed as Kodiak-owned liquidity); the remaining 60% funds a $KDK buyback.',
    HoldersRevenue: 'From 2026-01-01, 60% of the protocol revenue is used to buy $KDK on the open market (the Kodiak Reserve). Zero before 2026-01-01.',
  },
  breakdownMethodology: {
    Fees: {
      'Swap Fees': 'Swap fees paid by traders (pool fee tier times the amount swapped).',
    },
    SupplySideRevenue: {
      'Swap Fees To LPs': '~83.33% of swap fees distributed to liquidity providers.',
    },
    Revenue: {
      'Swap Fees Collected As Revenue': 'The ~16.67% of swap fees kept by the protocol.',
    },
    ProtocolRevenue: {
      'Swap Fees To Protocol': 'Full ~16.67% of swap fees kept by the protocol (before 2026-01-01).',
      'Swap Fees To Protocol-Owned Liquidity': 'From 2026-01-01, 30% of the protocol revenue deployed as Kodiak-owned liquidity.',
      'Swap Fees To Treasury': 'From 2026-01-01, 10% of the protocol revenue kept by the treasury.',
    },
    HoldersRevenue: {
      'KDK Buyback': 'From 2026-01-01, 60% of the protocol revenue used to buy $KDK on the open market.',
    },
  },
};

export default adapter;
