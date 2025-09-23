import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
const RPC_ENDPOINT = "https://rpc.qubic.org"

const fetchfunc = async (_: any, _1: any, _options: FetchOptions) => {
    const res = await fetch(`${RPC_ENDPOINT}/v1/latest-stats`).then((res) => res.json());
    const dailyFees = res.data.burnedQus * res.data.price;
    return {dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, dailyHoldersRevenue: 0}
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'All fees are burned via Qubic.',
    Revenue: 'Revenue is burned via Qubic.',
    ProtocolRevenue: 'Protocol revenue is burned via Qubic.',
  },
  adapter: {
  [CHAIN.QUBIC]: {
    fetch: fetchfunc,
    start: '2025-05-14',
  },
}
}

export default adapter;