import type { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { getPoolFees, AaveLendingPoolConfig } from '../../helpers/aave';
import { METRIC } from '../../helpers/metrics';

// Vena is an Aave V3 fork on Fluent, so we lean on the shared aave helper to
// derive fees from liquidity-index growth + flashloan/liquidation events.
const pool: AaveLendingPoolConfig = {
  version: 3,
  lendingPoolProxy: '0xD6E69976C8Aea2A4075Bc637fE8881672FF14013',
  dataProvider: '0xb6eEF266933382661827E36fE3f936396e80166E',
};

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  await getPoolFees(pool, options, {
    dailyFees,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
  });

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Fees: 'Include borrow interest, flashloan fee, liquidation fee and penalty paid by borrowers.',
  Revenue: 'Amount of fees go to Vena treasury.',
  SupplySideRevenue: 'Amount of fees distributed to suppliers.',
  ProtocolRevenue: 'Amount of fees go to Vena treasury.',
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: 'All interest paid by borrowers from all markets.',
    [METRIC.LIQUIDATION_FEES]: 'Fees from liquidation penalty and bonuses.',
    [METRIC.FLASHLOAN_FEES]: 'Flashloan fees paid by flashloan borrowers and executors.',
  },
  Revenue: {
    [METRIC.BORROW_INTEREST]: 'A portion of interest paid by borrowers from all markets.',
    [METRIC.LIQUIDATION_FEES]: 'A portion of fees from liquidation penalty and bonuses.',
    [METRIC.FLASHLOAN_FEES]: 'A portion of fees paid by flashloan borrowers and executors.',
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: 'Amount of interest distributed to lenders from all markets.',
    [METRIC.LIQUIDATION_FEES]: 'Fees from liquidation penalty and bonuses are distributed to lenders.',
    [METRIC.FLASHLOAN_FEES]: 'Flashloan fees paid by flashloan borrowers and executors are distributed to lenders.',
  },
  ProtocolRevenue: {
    [METRIC.BORROW_INTEREST]: 'Amount of interest distributed to lenders from all markets are collected by Vena treasury.',
    [METRIC.LIQUIDATION_FEES]: 'A portion of fees from liquidation penalty and bonuses are collected by Vena treasury.',
    [METRIC.FLASHLOAN_FEES]: 'A portion of fees paid by flashloan borrowers and executors are collected by Vena treasury.',
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  adapter: {
    fluent: {
      fetch,
      start: '2026-04-23',
    },
  },
};

export default adapter;
