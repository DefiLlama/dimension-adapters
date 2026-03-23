import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getEtherscanFees } from "../helpers/etherscanFees";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const amount = await getEtherscanFees(options, 'https://mega.etherscan.io/chart/transactionfee?output=csv')
  const dailyFees = options.createBalances()
  dailyFees.addCGToken('ethereum', amount / 1e18)

  return { dailyFees };
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.MEGAETH],
  start: '2026-01-30',
  protocolType: ProtocolType.CHAIN,
}

export default adapter;
