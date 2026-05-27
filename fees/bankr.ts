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

interface BankrDashboard {
  dailyProtocolFees: DailyProtocolFees[];
  dailyFees: DailyFees[];
}

// API structure:
// dailyProtocolFees.bankrFees -> protocol revenue
// dailyProtocolFees.creatorFees -> creator/supply side revenue
// dailyFees.clanker -> clanker integration fees
// dailyFees.doppler -> doppler integration fees
const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  
  const dashboard: BankrDashboard = await fetchURL('https://api.bankr.bot/public/dashboard');
  
  // Find the data for the requested date
  const targetDate = new Date(options.startOfDay * 1000).toISOString().split('T')[0];
  
  const protocolData = dashboard.dailyProtocolFees.find(d => d.date === targetDate);
  const feesData = dashboard.dailyFees.find(d => d.date === targetDate);
  
  if (!protocolData || !feesData) {
    return {
      dailyFees,
      dailyRevenue,
      dailyProtocolRevenue: dailyRevenue,
      dailySupplySideRevenue,
    };
  }
  
  // Daily fees: Clanker + Doppler
  dailyFees.addUSDValue(feesData.clanker, 'Clanker Fees');
  dailyFees.addUSDValue(feesData.doppler, 'Doppler Fees');
  
  // Protocol revenue: Bankr fees
  dailyRevenue.addUSDValue(protocolData.bankrFees, 'Protocol Fees');
  
  // Supply side revenue: Creator fees
  dailySupplySideRevenue.addUSDValue(protocolData.creatorFees, 'Creator Fees');

  return {
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
  start: '2025-08-11',
  chains: [CHAIN.BASE],
  methodology: {
    Fees: 'Clanker integration LP fees and Doppler integration fees',
    Revenue: 'Protocol fees from Bankr token launches and integrations',
    SupplySideRevenue: 'Creator fees from token launches',
  },
  breakdownMethodology: {
    Fees: {
      'Clanker Fees': 'LP fees from Clanker token integration',
      'Doppler Fees': 'Fees from Doppler integration',
    },
    Revenue: {
      'Protocol Fees': 'All protocol revenue from Bankr operations',
    },
    SupplySideRevenue: {
      'Creator Fees': 'Fees distributed to token creators',
    },
  }
};

export default adapter;
