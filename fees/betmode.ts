import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from '../helpers/metrics';

const address = '0xeb5D5af6a0ac3B64243858094d6b3b379B8772Aa'
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const feesStart = await options.fromApi.call({ target: address, abi: "uint:GGR" })
  const feesEnd = await options.toApi.call({ target: address, abi: "uint:GGR" })
  dailyFees.add(ADDRESSES.mode.USDC, feesEnd - feesStart, [METRIC.PROTOCOL_FEES])
  dailyFees.resizeBy(0.065)
  return { dailyFees, dailyRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.MODE],
  fetch,
  methodology: {
    Fees: "Fees paid by users for using the Betmode protocol.",
    Revenue: "100% Fees collected by Betmode protocol.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.PROTOCOL_FEES]: "Gross gaming revenue collected on the Betmode protocol in USDC",
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: "Gross gaming revenue collected on the Betmode protocol in USDC",
    },
  }
}

export default adapter;
