import { FetchOptions } from "../adapters/types";
import { httpGet } from "../utils/fetchURL";

const BUILDERS_STATS_API = 'https://api.starknet.extended.exchange/api/v1/info/builder/dashboard';

interface FetchBuilderDataOptions {
  options: FetchOptions;
  builderName: string;
  builderFeeRate?: number;
}

export const fetchBuilderData = async ({ options, builderName, builderFeeRate }: FetchBuilderDataOptions) => {
  const response = await httpGet(BUILDERS_STATS_API);
  const dateString = new Date(options.startOfDay * 1000).toISOString().split('T')[0];
  const dateItem = response.data.daily.find((i: any) => i.builderName === builderName && i.date === dateString);
  
  const dailyVolume = Number(dateItem.volume);
  const dailyFees = builderFeeRate ? dailyVolume * builderFeeRate : Number(dateItem.extendedFees);
  
  return { dailyVolume, dailyFees };
};
