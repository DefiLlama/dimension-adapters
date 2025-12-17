import { CHAIN } from "../helpers/chains";
import { FetchOptions } from "../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { httpGet } from "../utils/fetchURL";

async function getApiKey(): Promise<string> {
  const API_KEY = 'a2c903cc-b31e-4547-9299-b6d07b7631ab';
  const s = 1111111111111;
  const rotated = `${API_KEY.slice(8)}${API_KEY.slice(0, 8)}`;
  const now = Date.now();
  const time = `${(now + s).toString()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
  return Buffer.from(`${rotated}|${time}`).toString('base64');
}

const fetch = async (_a: number, _b: any, options: FetchOptions) => {
  const startOfDay = getTimestampAtStartOfDayUTC(options.startOfDay)
  const path = `/api/explorer/v2/common/charts/feeUsdDailyTotal?chain=X1&t=${startOfDay * 1e3}`
  const apiKey = await getApiKey()
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
