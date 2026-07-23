import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { httpGet } from "../utils/fetchURL";

const oiApi = "https://mainnet-api.monday.trade/v4/public/thirdPart/openInterest"

const chainConfig: { [key: string]: any } = {
  [CHAIN.MONAD]: { chainId: 143, start: '2025-11-25' }
};

const fetch = async (options: FetchOptions) => {
  const chainInfo = chainConfig[options.chain]

  const oiData = await httpGet(oiApi, {
    params: {
      chainId: chainInfo.chainId,
    }
  })
  const oi = Number(oiData.data);


  return { openInterestAtEnd: oi };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.MONAD],
  start: '2025-11-25',
  runAtCurrTime: true,
};

export default adapter;