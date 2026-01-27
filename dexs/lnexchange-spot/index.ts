import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpPost } from "../../utils/fetchURL";
import BigNumber from "bignumber.js";
import { CHAIN } from "../../helpers/chains";

const URL = "https://test-spots-api.ln.exchange/napi/common/getDayTradeAmount";

interface Response {
  dayNtlVlm: number;
}
const fetch = async (timestamp: number) => {
  const respose: Response[] = (
    await httpPost(URL, { dayTimestamp: timestamp * 1000 })
  ).data;
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const dailyVolume = respose.reduce((acc, item) => {
    return acc.plus(item.dayNtlVlm);
  }, new BigNumber(0));
  return {
    dailyVolume: dailyVolume?.toString(),
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BITCOIN]: {
      fetch,
      start: "2024-08-30",
    },
  },
};

export default adapter;
