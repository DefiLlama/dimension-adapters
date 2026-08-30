import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getEtherscanFees } from "../helpers/etherscanFees";

// Conduit retired the Blockscout API behind explorer.katanarpc.com,
// katanascan.com (Etherscan family) is the official explorer now
const fetch = async (options: FetchOptions) => {
  const amount = await getEtherscanFees(options, 'https://katanascan.com/chart/transactionfee?output=csv')
  const dailyFees = options.createBalances()
  dailyFees.addCGToken('ethereum', amount / 1e18)

  return { dailyFees };
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.KATANA],
  start: '2025-05-08',
  protocolType: ProtocolType.CHAIN,
}

export default adapter;
