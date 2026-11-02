import { getProvider } from '@defillama/sdk';
import optionsAdapter, { fetchTrading } from '../options/stryke-rfq';
import { FetchOptions, SimpleAdapter } from '../adapters/types';

// https://docs.stryke.xyz/tokenomics/protocol-fees: 20% retained, 80% to holders.
// October 30 coverage cutoff confirmed by the submitting team; earlier split unknown.
export const protocolRevenueStart = Date.parse('2026-10-30T00:00:00Z') / 1000;
const protocolShare = 0.2;

/** Report collected fees, with the retained share only for the supported split period. */
export async function fetchFees(options: FetchOptions) {
  const { dailyFees, dailyRevenue } = await fetchTrading(options);
  // Unknown historical allocation is omitted, not represented as zero.
  if (options.endTimestamp <= protocolRevenueStart) return { dailyFees, dailyRevenue };
  let eligibleRevenue = dailyRevenue;
  if (options.startTimestamp < protocolRevenueStart) {
    // Handle windows crossing the cutoff without applying today's split to older fills.
    const provider = getProvider(options.chain)!;
    let fromBlock = await options.getBlock(protocolRevenueStart, options.chain, {});
    let header = await provider.getBlock(fromBlock);
    if (!header) throw new Error('Missing RFQ split boundary block');
    while (header.timestamp < protocolRevenueStart) {
      header = await provider.getBlock(++fromBlock);
      if (!header) throw new Error('Missing RFQ split boundary block');
    }
    let previous = await provider.getBlock(fromBlock - 1);
    while (previous && previous.timestamp >= protocolRevenueStart) {
      fromBlock--;
      previous = await provider.getBlock(fromBlock - 1);
    }
    if (!previous) throw new Error('Missing RFQ split boundary block');
    const eligible = await fetchTrading({ ...options, startTimestamp: protocolRevenueStart,
      getLogs: params => options.getLogs({ ...params, fromBlock: Math.max(params.fromBlock ?? fromBlock, fromBlock) }),
    });
    eligibleRevenue = eligible.dailyRevenue;
  }
  const dailyProtocolRevenue = options.createBalances();
  dailyProtocolRevenue.addBalances(eligibleRevenue.getBalances(), 'Options Trading Fees To Protocol');
  dailyProtocolRevenue.resizeBy(protocolShare);
  return { dailyFees, dailyRevenue, dailyProtocolRevenue };
}

const adapter: SimpleAdapter = {
  ...optionsAdapter,
  fetch: fetchFees,
  methodology: {
    Fees: optionsAdapter.methodology!.Fees,
    Revenue: optionsAdapter.methodology!.Revenue,
    ProtocolRevenue: '20% of recorded RFQ trading fees from October 30, 2026, following the published protocol allocation. Earlier allocation is unknown and omitted. Holder income is measured separately at the Stryke parent, not estimated here.',
  },
  breakdownMethodology: {
    Fees: optionsAdapter.breakdownMethodology!.Fees,
    Revenue: optionsAdapter.breakdownMethodology!.Revenue,
    ProtocolRevenue: { 'Options Trading Fees To Protocol': '20% retained protocol allocation of recorded RFQ trading fees from October 30, 2026; excludes the 80% holder allocation.' },
  },
};

export default adapter;
