import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const bucketApiURL = "https://backend.bucketprotocol.io/api";
interface DailyStats {
  date: string;
  dailyFee: string;
  startTimestampMs: number;
  endTimestampMs: number;
}

const methodology = {
  dailyFees:
    "All the services fees paid by users, including borrow, PSM, liquidation, redeem, flashLoan and interest",
  dailyRevenue:
    "All the services fees paid by users, including borrow, PSM, liquidation, redeem, flashLoan and interest earned by Bucket",
};

const fetchBucketStats = async (
  _: any,
  _1: any,
  { startTimestamp }: FetchOptions
) => {
  const url = `${bucketApiURL}/fee/dailystatus?timestamp_ms=${
    startTimestamp * 1000
  }`;
  const stats: DailyStats = (await fetchURL(url)).data;

  const dailyFees = stats.dailyFee;
  const dailyRevenue = stats.dailyFee;

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: Adapter = {
  methodology,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchBucketStats,
      start: "2025-09-01",
    },
  },
};

export default adapter;
