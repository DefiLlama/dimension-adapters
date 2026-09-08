import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

interface DailyProtocolFees {
  date: string;
  bankrFees: number;
  creatorFees: number;
}

interface DailyByChain {
  date: string;
  base: number;
  robinhood: number;
}

interface BankrDashboard {
  dailyProtocolFees: DailyProtocolFees[];
  dailyFeesByChain: DailyByChain[];
  dailyVolumeByChain: DailyByChain[];
}

// API structure:
// dailyProtocolFees.bankrFees   -> protocol revenue, all chains combined
// dailyProtocolFees.creatorFees -> creator fees, all chains combined
// dailyFees.clanker/.doppler    -> gross fees by launch venue, all chains combined
// dailyFeesByChain              -> creator fees split per chain
// dailyVolumeByChain            -> trade volume split per chain
//
// Gross fees decompose exactly: dailyFees.clanker + dailyFees.doppler equals
// dailyProtocolFees.creatorFees + dailyProtocolFees.bankrFees on all 529 days the
// dashboard publishes. So the venue split (clanker/doppler) and the income split
// (creator/protocol) are two views of the same total, and only the income one can
// be attributed per chain: dailyFeesByChain.base + .robinhood reproduces
// creatorFees on all 529 days, and dailyVolumeByChain reproduces total volume on
// all 641 volume days, with zero mismatches on either.
//
// Fees are therefore built from creator + protocol rather than clanker + doppler.
// The two totals are identical in aggregate, but only this one can be split per
// chain without booking the Robinhood creator leg twice.
const CHAIN_KEY: Record<string, keyof Omit<DailyByChain, "date">> = {
  [CHAIN.BASE]: "base",
  [CHAIN.ROBINHOOD]: "robinhood",
};

const CREATOR_FEES = "Creator Fees";
const BANKR_FEES = "Bankr Launch and Integration Fees";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const dashboard: BankrDashboard = await fetchURL('https://api.bankr.bot/public/dashboard');

  const chainKey = CHAIN_KEY[options.chain];
  const targetDate = new Date(options.startOfDay * 1000).toISOString().split('T')[0];

  // the volume series has no gaps anywhere in its history, so a missing row is a
  // broken response rather than a quiet day and must not publish as a zero.
  const volumeRow = dashboard.dailyVolumeByChain.find(d => d.date === targetDate);
  if (!volumeRow) throw new Error(`Bankr: no dailyVolumeByChain row for ${targetDate}`);
  dailyVolume.addUSDValue(volumeRow[chainKey] ?? 0, 'Trade Volume');

  // the fee series does have real gaps (2025-10-07 and 2025-12-06 among them), so
  // a missing row here keeps the existing behaviour of reporting nothing.
  const feesByChain = dashboard.dailyFeesByChain.find(d => d.date === targetDate);
  const creatorFees = feesByChain ? feesByChain[chainKey] ?? 0 : 0;

  dailyFees.addUSDValue(creatorFees, CREATOR_FEES);
  dailySupplySideRevenue.addUSDValue(creatorFees, CREATOR_FEES);

  // the dashboard reports bankrFees combined across chains with no split, so the
  // whole protocol leg is booked on Base. Adding it to both chains would double
  // count it, and splitting it pro rata would be a guess.
  if (options.chain === CHAIN.BASE) {
    const protocolData = dashboard.dailyProtocolFees.find(d => d.date === targetDate);
    if (protocolData) {
      dailyFees.addUSDValue(protocolData.bankrFees, BANKR_FEES);
      dailyRevenue.addUSDValue(protocolData.bankrFees, BANKR_FEES);
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [
    [CHAIN.BASE, { start: '2025-08-11' }],
    // first day the dashboard reports a non-zero Robinhood leg
    [CHAIN.ROBINHOOD, { start: '2026-07-03' }],
  ],
  methodology: {
    Volume: 'Trade volume routed through Bankr, taken per chain from the dashboard\'s dailyVolumeByChain series.',
    Fees: 'Creator fees plus Bankr\'s own launch and integration fees. Creator fees are split per chain; the Bankr leg is only published combined, so it is reported on Base.',
    Revenue: 'Bankr\'s fees from token launches and integrations. The dashboard publishes this combined across chains, so it is reported on Base only.',
    ProtocolRevenue: 'Bankr\'s fees from token launches and integrations.',
    SupplySideRevenue: 'Fees paid out to token creators, split per chain.',
  },
  breakdownMethodology: {
    Volume: {
      'Trade Volume': 'Buy and sell volume routed through Bankr on this chain',
    },
    Fees: {
      [CREATOR_FEES]: 'Fees paid out to token creators on this chain',
      [BANKR_FEES]: 'Bankr\'s own cut of token launches and integrations, reported combined across chains',
    },
    Revenue: {
      [BANKR_FEES]: 'Bankr\'s own cut of token launches and integrations, reported combined across chains',
    },
    ProtocolRevenue: {
      [BANKR_FEES]: 'Bankr\'s own cut of token launches and integrations, reported combined across chains',
    },
    SupplySideRevenue: {
      [CREATOR_FEES]: 'Fees paid out to token creators on this chain',
    },
  }
};

export default adapter;
