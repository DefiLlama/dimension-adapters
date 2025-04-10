import { CarbonAnalyticsResponse } from "./types";
import { FetchOptions } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const fetchWithPagination = async (endpoint: string, limit: number = 10000) => {
  let offset = 0;
  let data = [];
  let unfinished = true;
  while (unfinished) {
    const url = new URL(endpoint);
    url.searchParams.append("limit", limit.toString());
    url.searchParams.append("offset", offset.toString());

    const newData = await fetchURL(url.href);
    data = data.concat(newData);

    unfinished = newData?.length === limit;
    offset += limit;
  }
  return data;
};

export const fetchDataFromApi = async (
  endpoint: string,
  startTimestampS?: number,
  endTimestampS?: number
): Promise<CarbonAnalyticsResponse> => {
  const url = new URL(endpoint);

  // Filter by date
  if (startTimestampS) {
    url.searchParams.append("start", startTimestampS.toString());
  }
  if (endTimestampS) {
    url.searchParams.append("end", endTimestampS.toString());
  }
  return fetchWithPagination(url.href);
};

export const getDimensionsSum = async (
  endpoint: string,
  startTimestamp: number,
  endTimestamp: number,
  chainStartTimestamp: number
) => {
  const dailyData: CarbonAnalyticsResponse = await fetchDataFromApi(
    endpoint,
    startTimestamp,
    endTimestamp
  );
  const swapData: CarbonAnalyticsResponse = await fetchDataFromApi(
    endpoint,
    chainStartTimestamp
  );

  const { dailyVolume, dailyFees } = dailyData.reduce(
    (prev, curr) => {
      return {
        dailyVolume: prev.dailyVolume + curr.volumeUsd,
        dailyFees: prev.dailyFees + curr.feesUsd,
      };
    },
    {
      dailyVolume: 0,
      dailyFees: 0,
    }
  );
  const { totalVolume, totalFees } = swapData.reduce(
    (prev, curr) => {
      return {
        totalVolume: prev.totalVolume + curr.volumeUsd,
        totalFees: prev.totalFees + curr.feesUsd,
      };
    },
    {
      totalVolume: 0,
      totalFees: 0,
    }
  );
  return {
    dailyVolume,
    totalVolume,
    dailyFees,
    totalFees,
    dailyRevenue: dailyFees,
    totalRevenue: totalFees,
  };
};

export const getEmptyData = (options: FetchOptions) => {
  return {
    dailyVolume: options.createBalances(),
    dailyFees: options.createBalances(),
    dailyRevenue: options.createBalances(),
    totalVolume: options.createBalances(),
    totalFees: options.createBalances(),
    totalRevenue: options.createBalances(),
  };
};
