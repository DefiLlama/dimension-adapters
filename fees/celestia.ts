import { ChainBlocks, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const url = (from: number, to: number) => `https://api.celenium.io/v1/stats/series/fee/day?from=${from}&to=${to}`
interface Fee {
  value: number
  time: string
}

const fetchFees = async (_t: number, _b: ChainBlocks, options: FetchOptions)  => {
  const dailyFees = options.createBalances();
  const res: Fee[] = await httpGet(url(options.fromTimestamp, options.toTimestamp))
  res.forEach(fee => {
    dailyFees.addCGToken('celestia', Number(fee.value)/1e6, 'Transaction fees paid in TIA')
  })
  return {
    timestamp: options.startOfDay,
    dailyFees,
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.CELESTIA]: {
      fetch: fetchFees,
          },
  },
  protocolType: ProtocolType.CHAIN,
  breakdownMethodology: {
    Fees: {
      'Transaction fees paid in TIA': 'Gas fees paid by users in TIA for submitting transactions and data blobs on the Celestia network, fetched from the Celenium API.',
    },
  },
}

export default adapter;
