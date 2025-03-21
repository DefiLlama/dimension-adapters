import type { SimpleAdapter } from "../../adapters/types";
import { FetchOptions, FetchResultV2, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
const abi = {
  getBookKey: "function getBookKey(uint192 id) view returns ((address base, uint64 unitSize, address quote, uint24 makerPolicy, address hooks, uint24 takerPolicy))",
  take: 'event Take(uint192 indexed bookId, address indexed user, int24 tick, uint64 unit)'
}
const bookManagerContract = {
  [CHAIN.SONIC]: '0xD4aD5Ed9E1436904624b6dB8B1BE31f36317C636',
}

const fetch: FetchV2 = async ({ getLogs, createBalances, chain, api }: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = createBalances()

  const target = bookManagerContract[chain]
  const takeEvents = await getLogs({ target, eventAbi: abi.take, })

  const bookKeys = takeEvents.map(i => i.bookId.toString())
  const tokens = await api.multiCall({ abi: abi.getBookKey, calls: bookKeys, target })
  takeEvents.forEach((i, idx) => dailyVolume.add(tokens[idx].quote, i.unit))

  return { dailyVolume, };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SONIC]: {
      fetch: fetch,
      start: '2024-12-09',
      meta: {
        methodology: 'Volume is calculated by summing the quote token volume of all trades on the protocol.',
      }
    },
  }
};

export default adapter;
