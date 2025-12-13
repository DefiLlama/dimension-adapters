import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  let openInterestAtEnd = 0;
  
  const response = await httpGet('https://prod-openapi.antarctic.exchange/futures/common/v1/perpetual/open-interest')
  for (const item of response.data) {
    openInterestAtEnd += Number(item.openInterestUsd)
  }

  return {
    openInterestAtEnd,
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  runAtCurrTime: true,
};

export default adapter;
