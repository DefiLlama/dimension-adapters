import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getOklinkApiKey } from "../helpers/oklink";
import { httpGet } from "../utils/fetchURL";

const fetch = async (options: FetchOptions) => {
  const timestamp = options.startOfDay * 1e3;
  const apiKey = await getOklinkApiKey();
  const headers = { 'x-apikey': apiKey };
  const data = await httpGet(`https://www.oklink.com/api/explorer/v2/common/charts/uniqueAddress?chain=X1&t=${timestamp}`, { headers });
  const entry = data.data.value.find((item: any) => item.timestamp == timestamp);
  if (!entry) {
    throw new Error(`No X-Layer new user data found for ${timestamp}`);
  }

  return {
    dailyNewUsers: Number(entry.addedUniqueAddressCount),
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.XLAYER],
  protocolType: ProtocolType.CHAIN,
  start: '2024-03-30',
};

export default adapter;
