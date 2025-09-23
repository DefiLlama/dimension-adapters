import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const RPC_ENDPOINT = "https://rpc.qubic.org"

const fetch = async (_: any, _1: any, _options: FetchOptions) => {
  const res = await httpGet(`${RPC_ENDPOINT}/v1/latest-stats`)

  const dailyFees = 25942857143 * res.data.price;

  return { 
    dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue: dailyFees,
    dailyProtocolRevenue: 0,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'All fees collected from XMR and XTM mining rewards.',
    Revenue: 'All fees collected from XMR and XTM mining rewards.',
    ProtocolRevenue: 'Protocol revenue takes no revenue shares.',
    HoldersRevenue: 'All fees are used to buy back QUBIC and burn them.',
  },
  adapter: {
  [CHAIN.QUBIC]: {
    fetch: fetch,
    start: '2025-05-14',
    runAtCurrTime: true,
  },
}
}

export default adapter;
