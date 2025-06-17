import { FetchOptions, FetchResultGeneric, SimpleAdapter } from "../../adapters/types";
import { CHAIN_CONFIG } from "./config";
import { USDNVolumeService } from "./usdn-volume";

const adapter: SimpleAdapter = { adapter: {}, version: 2 };

Object.keys(CHAIN_CONFIG.START_TIME).forEach((chain: string) => {
  adapter.adapter[chain] = {
    fetch: async (options: FetchOptions) => {
      try {
        const smardexUsdnDimensions = {} as FetchResultGeneric;
        const volumeService = new USDNVolumeService(options);
        const usdnVolume = await volumeService.getUsdnVolume();
        smardexUsdnDimensions.dailyVolume =
          usdnVolume + Number(smardexUsdnDimensions.dailyVolume || 0);

        return {
          ...smardexUsdnDimensions,
          totalVolume: undefined,
        };
      } catch (error) {
        console.error(`Error fetching data for ${chain}:`, error);
        return {};
      }
    },
    start: CHAIN_CONFIG.START_TIME[chain],
  };
});

export default adapter;
