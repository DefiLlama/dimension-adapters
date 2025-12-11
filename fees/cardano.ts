// Source: https://cexplorer.io/

import { SimpleAdapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const data = await httpGet('https://api-mainnet-stage.cexplorer.io/v1/analytics/rate?display=sum_fee', {
    headers: {
      'content-type': 'application/json',
      'accept': 'application/json',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    },
  })
  const df = data.data.data.find((item: any) => item.date === options.dateString)
  const dailyFees = options.createBalances()
  dailyFees.addCGToken('cardano', df.stat.sum_fee / 1e6)

  return {
    dailyFees,
    dailyRevenue: 0
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.CARDANO],
  fetch,
  start: '2017-09-24',
  protocolType: ProtocolType.CHAIN
}

export default adapter;
