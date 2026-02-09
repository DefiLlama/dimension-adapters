import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const url = `https://explorer.dogechain.dog/api?module=stats&action=totalfees&date=${options.dateString}`;

  const fees = await httpGet(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
  });

  if (fees && fees.result !== undefined && fees.result !== null) {
    dailyFees.addCGToken('dogecoin', fees.result / 1e18);
  }

  return {
    dailyFees
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.DOGECHAIN],
  fetch,
  start: '2022-08-01',
  protocolType: ProtocolType.CHAIN
};

export default adapter;
