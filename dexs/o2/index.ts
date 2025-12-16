import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const url = `https://api.o2.app/defillama/v1/volumes?from=${options.startTimestamp}&to=${options.endTimestamp}`;
  const volumeResults = await fetchURL(url);
  volumeResults.forEach((result: any) => {
    dailyVolume.add(result.base_asset_id, result.base_volume);
  });
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.FUEL],
  start: "2025-12-01",
};

export default adapter;
