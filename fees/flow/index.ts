import { FetchOptions, FetchResult, ProtocolType, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

async function fetch(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {
  const start = new Date(options.startOfDay * 1000).toISOString();
  const end = new Date(options.endTimestamp * 1000).toISOString();

  const response = await fetchURL(`https://api.find.xyz/flowscan/v1/stats?from=${start}&metric=fees&timescale=daily&to=${end}`);

  if (!response || !response.data || !response.data[0])
    throw new Error('Flow fees not found');

  const dailyFees = options.createBalances();
  dailyFees.addCGToken('flow', response.data[0].number);

  return {
    dailyFees,
    dailyRevenue: 0
  };
}

const methodology = {
  Fees: 'Transaction and storage fees paid by users',
  Revenue: 'No revenue'
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.FLOW],
  start: '2018-12-19',
  methodology,
  protocolType: ProtocolType.CHAIN
}

export default adapter