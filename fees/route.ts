import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { addToken, collector, engines, feePaid, settled } from '../helpers/aggregators/route';

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const oldFees = await options.getLogs({ targets: engines, eventAbi: feePaid });
  const currentFees = await options.getLogs({ target: collector, eventAbi: settled });
  for (const log of oldFees) {
    addToken(dailyFees, log.token, log.feeAmount.toString(), 'Swap Fees');
    addToken(dailyRevenue, log.token, log.feeAmount.toString(), 'Swap Fees To Route');
  }
  for (const log of currentFees) {
    addToken(dailyFees, log.tokenOut, log.feeAmount.toString(), 'Swap Fees');
    addToken(dailyRevenue, log.tokenOut, log.feeAmount.toString(), 'Swap Fees To Route');
  }
  // Revenue belongs to Route; buying protocol-owned LP is not a payment to outside LPs.
  // Do not add receiver conversions/escrow claims again. The mixed-source worker cannot
  // attribute realized holder distributions to swap fees alone; omit that metric, not zero.
  return { dailyFees, dailyRevenue, dailySupplySideRevenue: 0 };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  fetch,
  start: '2026-09-05',
  methodology: {
    Fees: 'Actual Route output-token swap fees from historical FeePaid and current Settled events; excludes pool/provider fees, gas, creator fees and private transfers.',
    Revenue: 'All collected Route swap fees accrue to Route-controlled recipients; later conversions and allocations are not counted again.',
    SupplySideRevenue: 'No portion of this aggregator fee is paid to external liquidity providers or referrers; protocol-owned liquidity is a capital allocation.',
  },
  breakdownMethodology: {
    Fees: { 'Swap Fees': 'Actual emitted fee amounts, not an assumed fee rate multiplied by volume; includes historical fees and the September 11, 2026 tiered collector.' },
    Revenue: { 'Swap Fees To Route': 'Swap fees received by Route treasury or its fee receiver, before subsequent buybacks and protocol-owned liquidity allocations.' },
  },
};
export default adapter;
