import type { SimpleAdapter } from "../../adapters/types";
import { FetchOptions, FetchResultV2, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
const abi = {
  getBookKey: "function getBookKey(uint192 id) view returns ((address base, uint64 unitSize, address quote, uint24 makerPolicy, address hooks, uint24 takerPolicy))",
  take: 'event Take(uint192 indexed bookId, address indexed user, int24 tick, uint64 unit)',
  swap: 'event Swap(address indexed user, address indexed inToken, address indexed outToken, uint256 amountIn, uint256 amountOut, address router, bytes4 method)',
  feeCollected: 'event FeeCollected(address indexed recipient, address indexed token, uint256 amount)'
}
const bookManagerContract = '0x6657d192273731C3cAc646cc82D5F28D0CBE8CCC'
const routerGatewayContract = '0x7B58A24C5628881a141D630f101Db433D419B372'

const parseFeeInfo = (value: bigint) => {
  return {
    usesQuote: value >> 23n > 0n,
    bps: Number(((value & 0x7fffffn) - 500000n) / 100n)
  }
}

const fetch: FetchV2 = async ({ getLogs, createBalances, api }: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = createBalances()
  const dailyFees = createBalances()

  const takeEvents = await getLogs({ target: bookManagerContract, eventAbi: abi.take, })
  const swapEvents = await getLogs({ target: routerGatewayContract, eventAbi: abi.swap, })
  const feeCollectedEvents = await getLogs({ target: routerGatewayContract, eventAbi: abi.feeCollected, })

  const bookKeys = takeEvents.map(i => i.bookId.toString())
  const tokens = await api.multiCall({ abi: abi.getBookKey, calls: bookKeys, target: bookManagerContract })
  takeEvents.forEach((i, idx) => {
    const quoteAmount = Number(i.unit) * Number(tokens[idx].unitSize)
    dailyVolume.add(tokens[idx].quote, quoteAmount)
    const { bps, usesQuote } = parseFeeInfo(BigInt(i.takerPolicy))
    if (usesQuote) {
      dailyFees.add(tokens[idx].quote, (quoteAmount * bps) / 10000)
    }
  })

  swapEvents.forEach((i, idx) => dailyVolume.add(i.outToken, Number(i.amountOut)))

  feeCollectedEvents.forEach((i) => dailyFees.add(i.token, Number(i.amount)))

  return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, dailyHoldersRevenue: '0' };
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
