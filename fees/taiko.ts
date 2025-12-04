import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getEtherscanFees } from "../helpers/etherscanFees";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const amount = await getEtherscanFees(options, 'https://taikoscan.io/chart/transactionfee?output=csv')
  const dailyFees = options.createBalances()
  dailyFees.addCGToken('ethereum', amount / 1e18)

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.TAIKO],
  start: '2024-05-25',
  protocolType: ProtocolType.CHAIN,
}

export default adapter;
