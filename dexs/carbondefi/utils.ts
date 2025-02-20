import { Balances } from "@defillama/sdk";
import { CarbonAnalyticsResponse } from "./types";
import { FetchOptions } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const isNativeToken = (address: string) =>
  address.toLowerCase() ===
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE".toLowerCase();

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
  endTimestampS?: number,
  tokens?: string[]
): Promise<CarbonAnalyticsResponse> => {
  const url = new URL(endpoint);

  // Filter by tokens
  if (tokens?.length) url.searchParams.append("addresses", tokens.toString());

  // Filter by date
  if (startTimestampS && endTimestampS) {
    url.searchParams.append("start", startTimestampS.toString());
    url.searchParams.append("end", endTimestampS.toString());
  }
  return fetchWithPagination(url.href);
};

export const getDimensionsSum = async (
  endpoint: string,
  startTimestamp: number,
  endTimestamp: number
) => {
  const dailyData: CarbonAnalyticsResponse = await fetchDataFromApi(
    endpoint,
    startTimestamp,
    endTimestamp
  );
  const swapData: CarbonAnalyticsResponse = await fetchDataFromApi(endpoint);

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
  };
};

export const getDimensionsSumByToken = async (
  endpoint: string,
  tokens: string[],
  startTimestamp: number,
  endTimestamp: number,
  emptyData: {
    dailyVolume: Balances;
    dailyFees: Balances;
    totalVolume: Balances;
    totalFees: Balances;
  }
) => {
  const tokensEndpoint = endpoint + "/tokens";
  const dailyData: CarbonAnalyticsResponse = await fetchDataFromApi(
    tokensEndpoint,
    startTimestamp,
    endTimestamp,
    tokens
  );
  const swapData: CarbonAnalyticsResponse = await fetchDataFromApi(
    tokensEndpoint,
    undefined,
    undefined,
    tokens
  );

  const { dailyVolume, dailyFees, totalFees, totalVolume } = emptyData;

  swapData.forEach((swap) => {
    if (!swap.address) return;
    if (isNativeToken(swap.address)) {
      totalVolume.addGasToken(swap.volume * 1e18);
      totalFees.addGasToken(swap.fees * 1e18);
    } else {
      totalVolume.add(swap.address, swap.volume);
      totalFees.add(swap.address, swap.fees);
    }
  });
  dailyData.forEach((swap) => {
    if (!swap.address) return;
    if (isNativeToken(swap.address)) {
      dailyVolume.addGasToken(swap.volume * 1e18);
      dailyFees.addGasToken(swap.fees * 1e18);
    } else {
      dailyVolume.add(swap.address, swap.volume);
      dailyFees.add(swap.address, swap.fees);
    }
  });

  return {
    dailyVolume,
    dailyFees,
    totalVolume,
    totalFees,
  };
};

export const getEmptyData = (options: FetchOptions) => {
  return {
    dailyVolume: options.createBalances(),
    dailyFees: options.createBalances(),
    totalVolume: options.createBalances(),
    totalFees: options.createBalances(),
  };
};
