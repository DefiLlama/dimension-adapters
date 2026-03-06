import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getEtherscanFees } from "../helpers/etherscanFees";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const amount = await getEtherscanFees(options, 'https://xdcscan.com/chart/transactionfee?output=csv')
  const dailyFees = options.createBalances()
  dailyFees.addCGToken('xdce-crowd-sale', amount / 1e18)

  return { dailyFees };
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.XDC],
  start: '2019-06-01',
  protocolType: ProtocolType.CHAIN,
}

export default adapter;
