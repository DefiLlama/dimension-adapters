import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

const url = "https://mainnet-api.monday.trade/v4/public/thirdPart/defillama/volumeAndFees"

const chainConfig: { [key: string]: any } = {
  [CHAIN.MONAD]: { chainId: 143, start: '2025-11-25' }
};

const fetch = async (_t: number, _: any, options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const chainInfo = chainConfig[options.chain]

  const resData = await httpGet(url, {
    params: {
      chainId: chainInfo.chainId,
      startTime: options.startTimestamp,
      endTime: options.endTimestamp,
    }
  })

  resData.data.forEach((item: any) => {
    dailyVolume.addToken(item.tokenAddress, Number(item.volume));
  })

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
};

export default adapter;
