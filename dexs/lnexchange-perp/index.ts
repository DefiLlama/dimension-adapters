import type { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { httpPost } from "../../utils/fetchURL";
import BigNumber from "bignumber.js";
import { CHAIN } from "../../helpers/chains";

const URL =
  "https://test-futures-api.ln.exchange/napi/common/getDayTradeAmount";

interface Response {
  dayNtlVlm: number;
}
const fetch = async (options: FetchOptions) => {
  const respose: Response[] = (
    await httpPost(URL, { dayTimestamp: options.toTimestamp * 1000 })
  ).data;
  const dailyVolume = respose.reduce((acc, item) => {
    return acc.plus(item.dayNtlVlm);
  }, new BigNumber(0));
  if (dailyVolume.gt(200000000)) { // very high unusual spike in volume
    throw new Error("Unusual spike in volume, it's avg volume is 200M");
  }
  return {
    dailyVolume: dailyVolume?.toString(),
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.BITCOIN],
  start: "2024-10-20",
};

export default adapter;
