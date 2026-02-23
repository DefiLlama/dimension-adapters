import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

async function fetch(_a: any, _b: any, options: FetchOptions) {
  const dailyFees = options.createBalances()
  const timestamp = options.startOfDay;
  const date = new Date(timestamp * 1000);
  const yyyyMmDd = date.toISOString().split('T')[0];
  const data = await httpGet(`https://scan.eniac.network/api/v1/lines/txnsFee?from=${yyyyMmDd}`)
  
  for (const item of data.chart) {
    dailyFees.addCGToken('wrapped-egas', Number(item.value))
  }
  
  return { dailyFees }
}

const adapter: Adapter = {
  fetch,
  chains: [CHAIN.ENI],
  start: "2025-06-01",
  protocolType: ProtocolType.CHAIN,
};

export default adapter;