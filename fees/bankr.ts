import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

interface DailyProtocolFees {
  date: string;
  bankrFees: number;
  creatorFees: number;
}

interface DailyFees {
  date: string;
  clanker: number;
  doppler: number;
}

interface DailyByChain {
  date: string;
  base: number;
  robinhood: number;
}

interface BankrDashboard {
  dailyProtocolFees: DailyProtocolFees[];
  dailyFees: DailyFees[];
  dailyFeesByChain: DailyByChain[];
  dailyVolumeByChain: DailyByChain[];
}

// API structure:
// dailyProtocolFees.bankrFees  -> protocol revenue, all chains combined
// dailyProtocolFees.creatorFees-> creator/supply side revenue, all chains combined
// dailyFees.clanker            -> clanker integration fees, all chains combined
// dailyFees.doppler            -> doppler integration fees, all chains combined
// dailyFeesByChain             -> creator fees split per chain
// dailyVolumeByChain           -> trade volume split per chain
//
// dailyFeesByChain.base + .robinhood reproduces dailyProtocolFees.creatorFees on
// every one of the 529 days the dashboard publishes, and dailyVolumeByChain does
// the same against dailyFees.clanker + dailyFees.doppler across all 641 volume
// days, so both splits are the exact per-chain decomposition and not an estimate.
// There is no per-chain split for bankrFees or for the clanker/doppler fee legs,
// so those stay on Base, see the methodology note below.
const CHAIN_KEY: Record<string, keyof Omit<DailyByChain, "date">> = {
  [CHAIN.BASE]: "base",
  [CHAIN.ROBINHOOD]: "robinhood",
};

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
  dailySupplySideRevenue.addUSDValue(creatorFees, 'Creator Fees');

  if (options.chain === CHAIN.ROBINHOOD) {
    // creator fees are the only Robinhood leg the dashboard attributes per chain.
    // Booking them as the chain's fees keeps the chain internally consistent and
    // understates rather than overstates it.
    dailyFees.addUSDValue(creatorFees, 'Creator Fees');
    return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue, dailyHoldersRevenue: 0 };
  }

  const protocolData = dashboard.dailyProtocolFees.find(d => d.date === targetDate);
  const feesData = dashboard.dailyFees.find(d => d.date === targetDate);

  if (feesData) {
    dailyFees.addUSDValue(feesData.clanker, 'Clanker Fees');
    dailyFees.addUSDValue(feesData.doppler, 'Doppler Fees');
  }
  if (protocolData) {
    dailyRevenue.addUSDValue(protocolData.bankrFees, 'Protocol Fees');
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
    Fees: 'On Base, Clanker integration LP fees and Doppler integration fees. On Robinhood, the creator fee leg, which is the only fee figure the dashboard splits per chain.',
    Revenue: 'Protocol fees from Bankr token launches and integrations. The dashboard publishes this combined across chains, so it is reported on Base only.',
    SupplySideRevenue: 'Creator fees from token launches, split per chain.',
  },
  breakdownMethodology: {
    Volume: {
      'Trade Volume': 'Buy and sell volume routed through Bankr on this chain',
    },
    Fees: {
      'Clanker Fees': 'LP fees from Clanker token integration',
      'Doppler Fees': 'Fees from Doppler integration',
      'Creator Fees': 'Fees distributed to token creators on this chain',
    },
    Revenue: {
      'Protocol Fees': 'All protocol revenue from Bankr operations',
    },
    SupplySideRevenue: {
      'Creator Fees': 'Fees distributed to token creators on this chain',
    },
  }
};

export default adapter;
