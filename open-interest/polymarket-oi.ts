import { FetchOptions, SimpleAdapter, Dependencies } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// idea from https://dune.com/queries/3343122/5601864
const fetch = async (_: any, _b: any, options: FetchOptions) => {
  const openInterestAtEnd = options.createBalances();

  // USDC balance in these wallets
  const token = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // USDC token
  const wallets: Array<string> = [
    '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',
    '0x3A3BD7bb9528E159577F7C2e685CC81A765002E2',
  ]
  const balances = await options.api.multiCall({
    abi: 'function balanceOf(address) view returns (uint256)',
    target: token,
    calls: wallets.map(i => ({ params: [i] }))
  })

  for (const balance of balances) {
    openInterestAtEnd.add(token, balance)
  }

  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.POLYGON],
  start: "2022-01-01",
  dependencies: [Dependencies.DUNE],
};

export default adapter;