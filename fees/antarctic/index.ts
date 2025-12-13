import { Adapter, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

const feesAPI = "https://prod-openapi.antarctic.exchange/futures/common/v1/perpetual/fee"

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const url = feesAPI + "?timestamp=" + (options.startOfDay * 1000);

  const data = (await httpGet(url)) as { data: { totalFee: number } };  

  return {
    dailyFees: data.data.totalFee || 0,
  };
}

const adapter: Adapter = {
  fetch,
  start: '2025-05-10',
  chains: [CHAIN.OFF_CHAIN]
}

export default adapter;
