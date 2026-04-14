import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";
import { METRIC } from "../helpers/metrics";

const solendFeesURL = 'https://api.solend.fi/stats/daily-fees';

interface DailyStats {
  date: string,
  start: number,
  end: number,
  hostOriginationFees: string,
  hostFlashLoanFees: string,
  protocolOriginationFees: string,
  protocolFlashLoanFees: string,
  protocolSpreadFees: string,
  protocolLiquidationTakeRate: string,
  liquidityProviderInterest: string,
  closeFees: string,
  previous: string,
  next: string,
}

const fetch = async ({ createBalances, endTimestamp }: FetchOptions) => {
  const url = `${solendFeesURL}?ts=${endTimestamp}`
  const stats: DailyStats = (await fetchURL(url));

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  // Total borrow interest paid by borrowers (combines lender + protocol portions)
  const totalBorrowInterest = parseFloat(stats.liquidityProviderInterest) + parseFloat(stats.protocolSpreadFees);
  
  // Total origination fees (host + protocol)
  const totalOriginationFees = parseFloat(stats.hostOriginationFees) + parseFloat(stats.protocolOriginationFees);
  
  // Total flash loan fees (host + protocol)
  const totalFlashLoanFees = parseFloat(stats.hostFlashLoanFees) + parseFloat(stats.protocolFlashLoanFees);

  // User pays all these fees
  dailyFees.addUSDValue(totalBorrowInterest, METRIC.BORROW_INTEREST);
  dailyFees.addUSDValue(totalOriginationFees, 'Origination Fees');
  dailyFees.addUSDValue(totalFlashLoanFees, 'Flash Loan Fees');
  dailyFees.addUSDValue(parseFloat(stats.protocolLiquidationTakeRate), METRIC.LIQUIDATION_FEES);
  dailyFees.addUSDValue(parseFloat(stats.closeFees), 'Account Close Fees');

  // Protocol revenue (goes to DAO treasury)
  dailyRevenue.addUSDValue(parseFloat(stats.protocolOriginationFees), 'Origination Fees');
  dailyRevenue.addUSDValue(parseFloat(stats.protocolFlashLoanFees), 'Flash Loan Fees');
  dailyRevenue.addUSDValue(parseFloat(stats.protocolSpreadFees), METRIC.BORROW_INTEREST);
  dailyRevenue.addUSDValue(parseFloat(stats.protocolLiquidationTakeRate), METRIC.LIQUIDATION_FEES);

  // Supply side revenue (goes to lenders and hosts)
  dailySupplySideRevenue.addUSDValue(parseFloat(stats.liquidityProviderInterest), METRIC.BORROW_INTEREST);
  dailySupplySideRevenue.addUSDValue(parseFloat(stats.hostOriginationFees), 'Origination Fees');
  dailySupplySideRevenue.addUSDValue(parseFloat(stats.hostFlashLoanFees), 'Flash Loan Fees');

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};


const methodology = {
  Fees: 'Borrow interest, origination fees, flash loan fees, liquidation penalties, account close fees',
  Revenue: '20% interest spread, 80% of origination/flash loan fees, 30% of liquidation penalties',
  SupplySideRevenue: 'Lenders receive 80% of interest. Hosts/referrers receive 20% of origination/flash loan fees',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: 'Total interest paid by borrowers on loans',
    'Origination Fees': 'Upfront fees on new loans',
    'Flash Loan Fees': 'Fees from flash loan usage',
    [METRIC.LIQUIDATION_FEES]: 'Liquidation penalties paid by borrowers',
    'Account Close Fees': 'Fees for closing Solana accounts',
  },
  Revenue: {
    [METRIC.BORROW_INTEREST]: 'Protocol retains 20% interest spread',
    'Origination Fees': 'Protocol receives 80% of origination fees',
    'Flash Loan Fees': 'Protocol receives 80% of flash loan fees',
    [METRIC.LIQUIDATION_FEES]: 'Protocol receives 30% of liquidation penalties',
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: 'Lenders receive 80% of borrow interest',
    'Origination Fees': 'Hosts/referrers receive 20% of origination fees',
    'Flash Loan Fees': 'Hosts/referrers receive 20% of flash loan fees',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2023-01-31',
  methodology,
  breakdownMethodology,
};

export default adapter;
