import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL";

const endpoint =
  "https://api.prod.merkle.trade/external/defillama/v1/trading-volume";

const fetch = async (options: FetchOptions) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(options.toTimestamp * 1000));
  const res = (await fetchURL(`${endpoint}?ts=${options.toTimestamp}`));

  return {
    dailyVolume: res.dailyVolume,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.APTOS],
  start: '2023-10-24',
  deadFrom: "2026-02-07",
};

export default adapter;
