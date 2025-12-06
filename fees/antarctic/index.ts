import { Adapter, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraph/utils";
import { httpGet } from "../../utils/fetchURL";

const FeesAPI = "https://prod-openapi.antarctic.exchange/futures/common/v1/perpetual/fee"
const fetch = async (timestamp: number) => {
  let dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  dayTimestamp = (dayTimestamp) * 1000;
  const url = FeesAPI + "?timestamp=" + dayTimestamp;
  const data = (await httpGet(url)) as { data: { totalFee: number } };  

  return {
    dailyFees: data.data.totalFee || 0,
  };
}

const adapter: Adapter = {
  runAtCurrTime: true,
  fetch,
  start: '2025-05-10',
  chains: [CHAIN.OFF_CHAIN]
}

export default adapter;
