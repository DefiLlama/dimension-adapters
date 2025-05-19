import { CarbonAnalyticsResponse } from "./types";
import { FetchOptions } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

export const fetchDataFromApi = async (
  endpoint: string,
  startTimestampS?: number,
  endTimestampS?: number
): Promise<CarbonAnalyticsResponse> => {
  const url = new URL(endpoint);

  if (startTimestampS) {
    url.searchParams.append("start", startTimestampS.toString());
  }
  if (endTimestampS) {
    url.searchParams.append("end", endTimestampS.toString());
  }
  
  url.searchParams.append("limit", "10000");

  return fetchURL(url.href);
};

export const getDimensionsSum = async (
  endpoint: string,
  startTimestamp: number,
  endTimestamp: number,
  chainStartTimestamp: number
) => {
  const allData: CarbonAnalyticsResponse = await fetchDataFromApi(
    endpoint,
    chainStartTimestamp,
    endTimestamp
  );
 
  let dailyVolume = 0;
  let dailyFees = 0;
  let totalVolume = 0;
  let totalFees = 0;
  
  allData.forEach(item => {
    const timestamp = Number(item.timestamp);
    
    if (timestamp <= endTimestamp) {
      totalVolume += item.volumeUsd;
      totalFees += item.feesUsd;
      
      if (timestamp >= startTimestamp && timestamp < endTimestamp) {
        dailyVolume += item.volumeUsd;
        dailyFees += item.feesUsd;
      }
    }
  });
  
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
    dailyVolume: 0,
    dailyFees: 0,
    dailyRevenue: 0,
    totalVolume: 0,
    totalFees: 0,
    totalRevenue: 0,
  };
};
