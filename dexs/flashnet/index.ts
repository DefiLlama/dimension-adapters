import BigNumber from "bignumber.js";

import { httpGet } from "../../utils/fetchURL"
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const BASE_URL = "https://wonderingtrader.flashnet.xyz/flashnet/v1/";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const startTimestamp = new Date(options.startTimestamp * 1000).toISOString();
  const endTimestamp = new Date(options.endTimestamp * 1000).toISOString();

  const res = await httpGet(`${BASE_URL}dex/volume`, {
    params: {
      startTime: startTimestamp,
      endTime: endTimestamp,
    }
  });

  const volumeStr = res.volume;
  const volume = BigNumber(volumeStr).div(1e8).toNumber();

  dailyVolume.addCGToken('bitcoin', volume);

  return {
    dailyVolume,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SPARK]: {
      fetch,
      start: '2025-09-22',
    }
  },
  methodology: {
    Volume: "Flashnet DEX volume",
  }
};

export default adapter;
