import { ETHER_ADDRESS } from "@defillama/sdk/build/general";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const nextDayTimestamp = (timestamp: number) => timestamp + 86_400_000;

const fetchDailyStats = async (
  timestampSeconds: number
): Promise<{ feesETH: number }> => {
  const timestampMs = timestampSeconds * 1000;
  const from = timestampMs;
  const to = nextDayTimestamp(timestampMs);
  const url = `https://stats.yologames.io/stats?from=${from}&to=${to}`;
  const response = await fetchURL(url);
  return {
    feesETH: response.feesETH
  };
};

const fetch: any = async (timestampSeconds: number, _: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const today = getTimestampAtStartOfDayUTC(options.startOfDay);
  const statsApiResponse = await fetchDailyStats(today);
  dailyFees.add(ETHER_ADDRESS, statsApiResponse.feesETH * 1e18);
  return {
    timestamp: timestampSeconds,
    dailyFees,
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.BLAST]: {
      fetch,
      start: 1709251200,
      meta: {
        methodology: {
          Fees: "YOLO Games collects a 1% fee for Moon Or Doom and YOLO winnings, and a 3% fee on Poke The Bear winnings.",
        },
      },
    },
  },
};

export default adapter;
