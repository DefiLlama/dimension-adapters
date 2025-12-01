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
  Fees: "All the services fees paid by users, including borrow, PSM, liquidation, redeem, flashLoan and interest",
  Revenue: "All the services fees paid by users, including borrow, PSM, liquidation, redeem, flashLoan and interest earned by Bucket",
};

const fetch = async (_a: any, _b: any, { startTimestamp }: FetchOptions) => {
  const url = `${bucketApiURL}/fee/dailystatus?timestamp_ms=${ startTimestamp * 1000 }`;
  const stats: DailyStats = (await fetchURL(url)).data;

  const dailyFees = Number(stats.dailyFee);
  const dailyRevenue = Number(stats.dailyFee);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SUI],
  methodology,
  start: "2025-09-01",
};

export default adapter;
