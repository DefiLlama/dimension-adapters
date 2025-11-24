import type { SimpleAdapter } from "../../adapters/types";
import { FetchOptions, FetchResultV2, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
const abi = {
  getBookKey: "function getBookKey(uint192 id) view returns ((address base, uint64 unitSize, address quote, uint24 makerPolicy, address hooks, uint24 takerPolicy))",
  take: 'event Take(uint192 indexed bookId, address indexed user, int24 tick, uint64 unit)',
  swap: 'event Swap(address indexed user, address indexed inToken, address indexed outToken, uint256 amountIn, uint256 amountOut, address router, bytes4 method)'
}
const bookManagerContract = '0x6657d192273731C3cAc646cc82D5F28D0CBE8CCC'
const routerGatewayContract = '0x7B58A24C5628881a141D630f101Db433D419B372'

const fetch: FetchV2 = async ({ getLogs, createBalances, api }: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = createBalances()

  const takeEvents = await getLogs({ target: bookManagerContract, eventAbi: abi.take, })
  const swapEvents = await getLogs({ target: routerGatewayContract, eventAbi: abi.swap, })

  const bookKeys = takeEvents.map(i => i.bookId.toString())
  const tokens = await api.multiCall({ abi: abi.getBookKey, calls: bookKeys, target: bookManagerContract })
  takeEvents.forEach((i, idx) => dailyVolume.add(tokens[idx].quote, Number(i.unit) * Number(tokens[idx].unitSize)))

  swapEvents.forEach((i, idx) => dailyVolume.add(i.outToken, Number(i.amountOut)))

  return { dailyVolume, };
};

const adapter: SimpleAdapter = {
  methodology: 'Volume is calculated by summing the quote token volume of all trades on the protocol.',
  version: 2,
  adapter: {
    [CHAIN.MONAD]: {
      fetch,
      start: '2025-11-24',
    },
  }
};

export default adapter;
