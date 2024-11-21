import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import ADDRESSES from '../../helpers/coreAssets.json'

import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";


async function getTotalVolume(
  options: FetchOptions
): Promise<FetchResultV2> {
  const res = await httpGet(`https://app-mainnet.blaze.ninja/api/stats/defillama?startTime=${options.startTimestamp}&endTime=${options.endTimestamp}`);

  const totalVolume = options.createBalances()
  totalVolume.addCGToken(ADDRESSES.injective.INJ, res.totalVolume * 10^18);

  return { totalVolume: totalVolume }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.INJECTIVE]: {
      start: 60577920,
      fetch: (options: FetchOptions) =>
        getTotalVolume(options),
    }
  },
};

export default adapter;
