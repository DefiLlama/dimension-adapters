import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

interface ITxHistoryItem {
  date: string;
  feepayer: null | string;
  txCount: number;
  feeAmountInBaseToken: number;
  gasWanted: number;
  gasUsed: number;
  feeAmountInToken: number;
  feesPaidInUsd: number | null;
  maxTokenPriceUsd: number | null;
  minTokenPriceUsd: number | null;
  avgTokenPriceUsd: number | null;
}

const PROVENANCE_API_BASE =
  "https://service-explorer.provenance.io/api/v3/txs/history";

const getPreviousDate = (dateString: string): string => {
  const date = new Date(dateString + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().split("T")[0];
};

const fetch = async (_t: number, _b: any, options: FetchOptions) => {
  // Fetch 2 days of data to support fallback to previous day's price
  const prevDate = getPreviousDate(options.dateString);
  const url = `${PROVENANCE_API_BASE}?fromDate=${prevDate}&toDate=${options.dateString}&granularity=DAY`;
  const data: ITxHistoryItem[] = await httpGet(url);

  const dayData = data.find((item: ITxHistoryItem) => {
    const itemDate = item.date.split("T")[0];
    return itemDate === options.dateString;
  });

  if (!dayData) {
    throw new Error(`No data found for ${options.dateString}`);
  }

  let dailyFees: number;

  if (dayData.feesPaidInUsd !== null) {
    dailyFees = dayData.feesPaidInUsd;
  } else if (dayData.avgTokenPriceUsd !== null) {
    dailyFees = dayData.feeAmountInToken * dayData.avgTokenPriceUsd;
  } else {
    // Use previous day's price as fallback
    const prevDateString = getPreviousDate(options.dateString);
    const prevDayData = data.find((item: ITxHistoryItem) => {
      const itemDate = item.date.split("T")[0];
      return itemDate === prevDateString;
    });

    if (prevDayData?.avgTokenPriceUsd) {
      dailyFees = dayData.feeAmountInToken * prevDayData.avgTokenPriceUsd;
    } else {
      throw new Error(`No USD price data available for ${options.dateString}`);
    }
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees * 0.4, // 40% goes to HASH Market auction pool
  };
};

// https://docs.provenance.io/learn/the-hash-token#21723393565480d1b22eee948ef39c8e
const methodology = {
  Fees: "Transaction fees paid by users on Provenance blockchain in HASH tokens, converted to USD.",
  Revenue:
    "40% of transaction fees go to HASH Market auction pool (protocol revenue). 60% goes to validators.",
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.PROVENANCE]: {
      fetch,
      start: "2021-05-06",
    },
  },
  protocolType: ProtocolType.CHAIN,
};

export default adapter;
