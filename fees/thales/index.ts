/**
 * Overtime Fees Adapter
 *
 * Fee Calculation: Fee = Revenue + LP Performance Fee
 * - Revenue: SafeBoxFeePaid events from AMM contracts (uses safeBoxAmount field)
 * - LP Performance Fee: SafeBoxSharePaid events from LP contracts (uses safeBoxAmount field)
 */

import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { OVERTIME_CONTRACT_ADDRESSES, LP_CONTRACT_COLLATERAL_MAPPING } from './config';
import { OVERTIME_EVENT_ABI } from './abis';
import { parseSafeBoxFeePaidEvent, parseSafeBoxSharePaidEvent } from './parsers';
import { CHAIN } from "../../helpers/chains";

export async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyRevenue = options.createBalances();
  const dailyLPPerformanceFee = options.createBalances();
  const collateralMapping = LP_CONTRACT_COLLATERAL_MAPPING[options.chain] || {};

  await Promise.all([
    // Revenue from SafeBoxFeePaid events (AMM contracts)
    ...Object.values(OVERTIME_CONTRACT_ADDRESSES[options.chain] || {})
      .map(async (address) => {
        const logs = await options.getLogs({
          target: address as string,
          eventAbi: OVERTIME_EVENT_ABI.safeboxFeePaid,
          onlyArgs: true,
        });
        logs.forEach(log => parseSafeBoxFeePaidEvent(log, dailyRevenue));
      }),

    // LP performance fees from SafeBoxSharePaid events (LP contracts)
    ...Object.keys(collateralMapping)
      .map(async (address) => {
        const logs = await options.getLogs({
          target: address,
          eventAbi: OVERTIME_EVENT_ABI.safeboxSharePaid,
          onlyArgs: true,
        });
        logs.forEach(log => parseSafeBoxSharePaidEvent(log, address, collateralMapping, dailyLPPerformanceFee));
      })
  ]);

  // Fee = Revenue + LP Performance Fee
  const dailyFees = options.createBalances();
  dailyFees.addBalances(dailyRevenue);
  dailyFees.addBalances(dailyLPPerformanceFee);

  return {
    dailyFees,
    dailyRevenue,
  };
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2024-08-01',
    },
    [CHAIN.OPTIMISM]: {
      fetch,
      start: '2024-08-01',
    },
    [CHAIN.BASE]: {
      fetch,
      start: '2024-08-01',
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: '2025-04-01',
    },
  },
};

export default adapter;
