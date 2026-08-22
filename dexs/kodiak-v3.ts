import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV3LogAdapter } from "../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.BERACHAIN],
  start: '2025-02-07',
  fetch: async (options: FetchOptions) => {
    const graphFetch = getUniV3LogAdapter({
      factory: '0xD84CBf0B02636E7f53dB9E5e45A616E05d710990',
    })
    const result = await graphFetch(options);

    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailyHoldersRevenue = options.createBalances();

    // Kodiak V3 swap fees split: 65% to LPs, 35% kept by the protocol as revenue
    dailyFees.addBalances(result.dailyFees, 'Swap Fees');
    dailySupplySideRevenue.addBalances(result.dailyFees.clone(0.65), 'Swap Fees To LPs');
    dailyRevenue.addBalances(result.dailyFees.clone(0.35), 'Swap Fees Collected As Revenue');

    if (options.startOfDay >= 1767225600) {
      // From 2026-01-01 the 35% protocol revenue is allocated: 60% KDK buyback, 30% POL, 10% treasury
      dailyHoldersRevenue.addBalances(result.dailyFees.clone(0.35 * 0.6), 'KDK Buyback');
      dailyProtocolRevenue.addBalances(result.dailyFees.clone(0.35 * 0.3), 'Swap Fees To Protocol-Owned Liquidity');
      dailyProtocolRevenue.addBalances(result.dailyFees.clone(0.35 * 0.1), 'Swap Fees To Treasury');
    } else {
      dailyProtocolRevenue.addBalances(result.dailyFees.clone(0.35), 'Swap Fees To Protocol');
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
    Fees: 'Swap fees paid by traders on Kodiak V3 pools.',
    UserFees: 'Swap fees paid by traders.',
    Revenue: 'The 35% of swap fees the protocol keeps. The other 65% is paid to liquidity providers.',
    SupplySideRevenue: '65% of swap fees paid to liquidity providers.',
    ProtocolRevenue: 'The protocol\'s share of the 35% revenue that it retains. Before 2026-01-01 the protocol kept the full 35%. From 2026-01-01 the protocol retains 40% of that 35% (10% to the treasury and 30% deployed as Kodiak-owned liquidity); the remaining 60% funds a $KDK buyback.',
    HoldersRevenue: 'From 2026-01-01, 60% of the 35% protocol revenue is used to buy $KDK on the open market (the Kodiak Reserve). Zero before 2026-01-01.',
  },
  breakdownMethodology: {
    Fees: {
      'Swap Fees': 'Swap fees paid by traders (pool fee tier times the amount swapped).',
    },
    SupplySideRevenue: {
      'Swap Fees To LPs': '65% of swap fees distributed to liquidity providers.',
    },
    Revenue: {
      'Swap Fees Collected As Revenue': 'The 35% of swap fees kept by the protocol.',
    },
    ProtocolRevenue: {
      'Swap Fees To Protocol': 'Full 35% of swap fees kept by the protocol (before 2026-01-01).',
      'Swap Fees To Protocol-Owned Liquidity': 'From 2026-01-01, 30% of the 35% protocol revenue deployed as Kodiak-owned liquidity.',
      'Swap Fees To Treasury': 'From 2026-01-01, 10% of the 35% protocol revenue kept by the treasury.',
    },
    HoldersRevenue: {
      'KDK Buyback': 'From 2026-01-01, 60% of the 35% protocol revenue used to buy $KDK on the open market.',
    },
  },
};

export default adapter;
