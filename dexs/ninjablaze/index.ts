import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import ADDRESSES from '../../helpers/coreAssets.json'

import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";


async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const res = await httpGet(`https://app-mainnet.blaze.ninja/api/stats/defillama?startTime=${options.startTimestamp}&endTime=${options.endTimestamp}`);

  const dailyVolume = options.createBalances()
  dailyVolume.add(ADDRESSES.injective.INJ, res.totalVolume * 1e18);

  return { dailyVolume }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.INJECTIVE]: {
      start: '2024-03-12',
      fetch,
    }
  },
};

export default adapter;
