import type { SimpleAdapter } from "../../adapters/types";
import { FetchOptions, FetchResultV2, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
const abi = {
  getBookKey: "function getBookKey(uint192 id) view returns ((address base, uint64 unitSize, address quote, uint24 makerPolicy, address hooks, uint24 takerPolicy))",
  take: 'event Take(uint192 indexed bookId, address indexed user, int24 tick, uint64 unit)'
}
const bookManagerContract = {
  [CHAIN.BASE]: '0x382CCccbD3b142D7DA063bF68cd0c89634767F76',
  [CHAIN.ERA]: '0xAaA0e933e1EcC812fc075A81c116Aa0a82A5bbb8',
}

const fetch: FetchV2 = async ({ getLogs, createBalances, chain, api }: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = createBalances()

  const target = bookManagerContract[chain]
  const takeEvents = await getLogs({ target, eventAbi: abi.take, })

  const bookKeys = takeEvents.map(i => i.bookId.toString())
  const tokens = await api.multiCall({ abi: abi.getBookKey, calls: bookKeys, target })
  takeEvents.forEach((i, idx) => dailyVolume.add(tokens[idx].quote, Number(i.unit) * Number(tokens[idx].unitSize)))

  return { dailyVolume, };
};

const adapter: SimpleAdapter = {
  methodology: 'Volume is calculated by summing the quote token volume of all trades on the protocol.',
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2024-06-12',
    },
    [CHAIN.ERA]: {
      fetch,
      start: '2024-06-12',
    },
  }
};

export default adapter;
