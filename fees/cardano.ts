// Source: https://cexplorer.io/

import { SimpleAdapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances()

  const data = await httpGet('https://api-mainnet-stage.cexplorer.io/v1/analytics/rate?display=sum_fee', {
    headers: {
      'content-type': 'application/json',
      'accept': 'application/json',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    },
  })

  const treasuryCut = (await httpGet(
    `https://api.koios.rest/api/v1/epoch_params?order=epoch_no.desc&limit=1&select=epoch_no,treasury_growth_rate`
  ))[0]?.treasury_growth_rate

  const df = data.data.data.find((item: any) => item.date === options.dateString)
  
  if (!df) {
    throw Error(`No cardano fees data found at ${options.dateString}`)
  }

  dailyFees.addCGToken('cardano', df.stat.sum_fee / 1e6)

  // 2022-01-01
  const dailyRevenue = options.startOfDay >= 1577836800 ? dailyFees.clone(treasuryCut) : 0;
  
  return {
    dailyFees,
    dailyRevenue,
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
