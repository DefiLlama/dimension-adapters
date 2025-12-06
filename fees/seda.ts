import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const data = await httpGet('https://explorer-api.mainnet.seda.xyz/main/trpc/trends.sedaBurned?batch=1&input=%7B%220%22:%7B%22startDate%22:%222025-07-01T00:00:00.000Z%22%7D%7D')
  let today = null
  let yesterday = null
  for (const item of data[0].result.data.data) {
    if (item[0] == options.startOfDay * 1000) {
      today = item[1]
    }
    if (item[0] == (options.startOfDay * 1000) - 86400000) {
      yesterday = item[1]
    }
  }

  if (today && yesterday) {
    dailyFees.addCGToken('seda-2', Number((today - yesterday)/1e18))
  }

  return { dailyFees, dailyRevenue: dailyFees };
}

const methodology = {
  Fees: "fees paid by data requests in SEDA tokens",
  Revenue: "seda burned for each requests"
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SEDA],
  start: '2025-07-17',
  protocolType: ProtocolType.CHAIN,
  methodology,
}

export default adapter;
