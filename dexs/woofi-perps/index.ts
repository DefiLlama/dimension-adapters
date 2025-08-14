import { FetchResultFees, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const fetch = async (timestamp: number): Promise<FetchResultVolume & FetchResultFees> => {
  const perpsVolume = await fetchURL('https://api.woofi.com/woofi_pro/perps_volume');

  const rowsLength = perpsVolume?.data?.rows?.length;
  const result = perpsVolume?.data?.rows?.[rowsLength - 1];

  return {
    dailyVolume: result?.["perp_volume"],
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    base: {
      fetch,
      runAtCurrTime: true,
      start: '2025-06-01',
    },
  },
};

export default adapter;
