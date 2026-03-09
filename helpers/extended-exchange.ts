import { FetchOptions } from "../adapters/types";
import { httpGet } from "../utils/fetchURL";

const BUILDERS_STATS_API = 'https://api.starknet.extended.exchange/api/v1/info/builder/dashboard';

interface FetchBuilderDataOptions {
  options: FetchOptions;
  builderNames: Array<string>;
  builderFeeRate?: number;
}

export const fetchBuilderData = async ({ options, builderNames, builderFeeRate }: FetchBuilderDataOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  
  const response = await httpGet(BUILDERS_STATS_API);
  const dateString = new Date(options.startOfDay * 1000).toISOString().split('T')[0];
  const dateItem = response.data.daily.find((i: any) => builderNames.includes(i.builderName) && i.date === dateString);
  
  if (dateItem) {
    const volume = Number(dateItem.volume);
    const fees = builderFeeRate ? volume * builderFeeRate : Number(dateItem.extendedFees);
    
    dailyVolume.addUSDValue(volume);
    dailyFees.addUSDValue(fees);
  }
  
  return { dailyVolume, dailyFees };
};
