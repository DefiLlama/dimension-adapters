import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const url = (from: number, to: number) => `https://api.celenium.io/v1/stats/series/fee/day?from=${from}&to=${to}`
interface Fee {
  value: number
  time: string
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const res: Fee[] = await httpGet(url(options.fromTimestamp, options.toTimestamp))

  res.forEach(fee => {
    dailyFees.addCGToken('celestia', Number(fee.value) / 1e6)
  })
  return { dailyFees }
}

const adapter: SimpleAdapter = {
  chains: [CHAIN.CELESTIA],
  fetch,
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: 'Transaction fees paid in TIA',
  },
}

export default adapter;
