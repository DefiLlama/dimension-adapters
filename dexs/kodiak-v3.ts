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

    dailyFees.addBalances(result.dailyFees, 'Swap Fees');
    dailySupplySideRevenue.addBalances(result.dailyFees.clone(0.65), 'Swap Fees To LPs');
    dailyRevenue.addBalances(result.dailyFees.clone(0.35), 'Swap Fees Collected As Revenue');

    if (options.startOfDay >= 1767225600) {
      dailySupplySideRevenue.addBalances(result.dailyFees.clone(0.35 * 0.3), 'Swap Fees To Protocol-Owned Liquidity');
      dailyProtocolRevenue.addBalances(result.dailyFees.clone(0.35 * 0.1), 'Swap Fees To Protocol');
      dailyHoldersRevenue.addBalances(result.dailyFees.clone(0.35 * 0.6), 'Token Buy Back');
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
    Fees: 'Swap fees paid by users.',
    UserFees: 'Swap fees paid by users.',
    Revenue: 'There are 35% swap fees are collected as revenue.',
    SupplySideRevenue: 'There are 65% swap fees are collected as revenue + 30% of revenue share to Protocol-Owned Liquidity from 01-01-2026.',
    ProtocolRevenue: 'There are 10% revenue collected by Kodiak protocol, it was 100% before 01-01-2026.',
    HoldersRevenue: 'From 01-01-2026, there are 60% revenue are used to by back $KDK.',
  },
  breakdownMethodology: {
    Fees: {
      'Swap Fees': 'Swap fees paid by users.',
    },
    SupplySideRevenue: {
      'Swap Fees To LPs': 'Share of 65% swap fees to LPs.',
      'Swap Fees To Protocol-Owned Liquidity': '30% of revenue to Protocol-Owned Liquidity.',
    },
    Revenue: {
      'Swap Fees Collected As Revenue': 'There are 35% swap fees are collected as revenue.',
    },
    HoldersRevenue: {
      'Token Buy Back': 'From 01-01-2026, there are 60% revenue are used to by back $KDK.',
    },
  },
};

export default adapter;
