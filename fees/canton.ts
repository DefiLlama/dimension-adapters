import { FetchOptions, ProtocolType, Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const API_URL = "https://fossil-outlook-levitate-gloomy.cantonscan.com/api/mining-rounds/timeseries?interval=day";

interface DailyData {
  date: string;
  burnAmount: number;
  burnedFromFees: number;
  burnedFromTrafficPurchases: number;
  avgAmuletPrice: number;
}

let cachedData: Promise<Record<string, DailyData>> | null = null;

function getDataMap(): Promise<Record<string, DailyData>> {
  if (!cachedData) {
    cachedData = fetchURL(API_URL).then((res: { data: DailyData[] }) => {
      const map: Record<string, DailyData> = {};
      res.data.forEach((entry) => {
        map[entry.date] = entry;
      });
      return map;
    });
  }
  return cachedData;
}

const LABELS = {
  TokenBurn: "Token Burn",
};

export const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dataMap = await getDataMap();
  const dayData = dataMap[options.dateString];

  if (!dayData) throw new Error(`Canton: no data for date ${options.dateString}`);

  const dailyFees = options.createBalances();

  const burnUsd = dayData.burnAmount * dayData.avgAmuletPrice;

  dailyFees.addUSDValue(burnUsd, LABELS.TokenBurn);

  return { dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees };
};

// Canton uses a burn-mint equilibrium model where 100% of network fees are permanently burned.
// Fees come from two sources: transaction fees and validator traffic purchases (bandwidth costs).
// Since CIP-0078 (Sep 2025), CC transfer fees were removed — traffic purchases now account for ~95% of all burn.
// https://github.com/global-synchronizer-foundation/cips/blob/main/cip-0078/cip-0078.md

const adapter: Adapter = {
  version: 1,
  fetch,
  start: '2024-06-26',
  chains: [CHAIN.CANTON],
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: 'Total CC burned daily from transaction fees and validator traffic purchases',
    Revenue: 'All burned CC is permanently removed from supply',
    HoldersRevenue: 'All burned CC benefits token holders by reducing circulating supply',
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.TokenBurn]: "Total CC burned daily (transaction fee burns + traffic purchase burns)",
    },
  },
};

export default adapter;
