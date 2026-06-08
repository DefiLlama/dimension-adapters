import { CHAIN } from "../helpers/chains";
import { FetchOptions } from "../adapters/types";
import { getOklinkApiKey } from "../helpers/oklink";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { httpGet } from "../utils/fetchURL";

const fetch = async (options: FetchOptions) => {
  const startOfDay = getTimestampAtStartOfDayUTC(options.startOfDay)
  const path = `/api/explorer/v2/common/charts/feeUsdDailyTotal?chain=X1&t=${startOfDay * 1e3}`
  const apiKey = await getOklinkApiKey()
  const data = await httpGet(`https://www.oklink.com${path}`, {
    headers: {
      'x-apikey': apiKey,
    }
  });
  const timestamp = Math.floor(options.startOfDay * 1e3)
  const fees = data.data.value.find((item: any) => item.timestamp == timestamp)
  if (!fees) {
    throw new Error(`No Fees found for ${timestamp}`)
  }
  return {
    dailyFees: fees.feeUsdDailyTotal,
  };
};

const adapter: any = {
  version: 1,
  fetch,
  chains: [CHAIN.XLAYER],
  start: '2024-03-30'
};

export default adapter;
