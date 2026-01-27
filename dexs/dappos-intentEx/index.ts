import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const URL = "https://trade-info.dappos.com/market/archive?timestamp=";

interface Response {
  daily_trade_volume: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const url = `${URL}${dayTimestamp}`
  const respose: Response[] = await httpGet(url);
  const dailyVolume = respose.reduce((acc, item) => {
    return acc + Number(item.daily_trade_volume);
  }, 0);

  return {
    dailyVolume: dailyVolume?.toString(),
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.OP_BNB]: {
      fetch,
      start: '2025-01-01',
    },
  }
};

export default adapter;