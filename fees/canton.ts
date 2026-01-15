import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";
import { METRIC } from "../helpers/metrics";

interface MiningRoundData {
  date: string;
  burnedFromFees: number;
  burnedFromTrafficPurchases: number;
}

interface ApiResponse {
  data: MiningRoundData[];
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const response: ApiResponse = await httpGet(
    "https://www.cantonscan.com/api/mining-rounds/timeseries?interval=day"
  );

  const targetDate = new Date(options.startTimestamp * 1000)
    .toISOString()
    .slice(0, 10);

  const day = response.data.find(d => d.date === targetDate);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  if (!day) {
    return {
      dailyFees,
      dailyRevenue,
      dailyHoldersRevenue: dailyRevenue,
    };
  }

  const burnedFromFees = day.burnedFromFees ?? 0;
  const burnedFromTrafficPurchases = day.burnedFromTrafficPurchases ?? 0;

  dailyFees.addGasToken(burnedFromFees, METRIC.TRANSACTION_GAS_FEES);
  dailyFees.addGasToken(burnedFromTrafficPurchases, 'Traffic Purchases');
  dailyRevenue.addGasToken(burnedFromFees, METRIC.TRANSACTION_GAS_FEES);
  dailyRevenue.addGasToken(burnedFromTrafficPurchases, 'Traffic Purchases');

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "Total transaction fees and traffic purchases paid on Canton chain (burnedFromFees + burnedFromTrafficPurchases)",
  Revenue: "Amount of fees and traffic purchases that were burned (burnedFromFees + burnedFromTrafficPurchases)",
  HoldersRevenue: "Amount of fees and traffic purchases that were burned, benefiting token holders (burnedFromFees + burnedFromTrafficPurchases)",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRANSACTION_GAS_FEES]: 'Transaction fees paid by users that are burned',
    'Traffic Purchases': 'Traffic purchases that are burned',
  },
  Revenue: {
    [METRIC.TRANSACTION_GAS_FEES]: 'Transaction fees that were burned',
    'Traffic Purchases': 'Traffic purchases that were burned',
  },
  HoldersRevenue: {
    [METRIC.TRANSACTION_GAS_FEES]: 'Transaction fees that were burned, benefiting token holders',
    'Traffic Purchases': 'Traffic purchases that were burned, benefiting token holders',
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.CANTON],
  start: "2024-06-26",
  protocolType: ProtocolType.CHAIN,
  methodology,
  breakdownMethodology,
};

export default adapter;

