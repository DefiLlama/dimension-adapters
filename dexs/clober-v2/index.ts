import type { SimpleAdapter } from "../../adapters/types";
import { FetchOptions, FetchResultV2, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
const abi = {
  getBookKey: "function getBookKey(uint192 id) view returns ((address base, uint64 unitSize, address quote, uint24 makerPolicy, address hooks, uint24 takerPolicy))",
  take: 'event Take(uint192 indexed bookId, address indexed user, int24 tick, uint64 unit)',
  swap: 'event Swap(address indexed user, address indexed inToken, address indexed outToken, uint256 amountIn, uint256 amountOut, address router, bytes4 method)',
  feeCollected: 'event FeeCollected(address indexed recipient, address indexed token, uint256 amount)'
}
const bookManagerContract: Record<string, string> = {
  [CHAIN.BASE]: '0x382CCccbD3b142D7DA063bF68cd0c89634767F76',
  [CHAIN.ERA]: '0xAaA0e933e1EcC812fc075A81c116Aa0a82A5bbb8',
  [CHAIN.MONAD]: '0x6657d192273731C3cAc646cc82D5F28D0CBE8CCC',
}

const routerGatewayContract: Record<string, string> = {
  [CHAIN.MONAD]: '0x7B58A24C5628881a141D630f101Db433D419B372',
}

type SupportedChains = keyof typeof bookManagerContract

const parseFeeInfo = (value: bigint) => {
  return {
    usesQuote: value >> 23n > 0n,
    bps: Number(((value & 0x7fffffn) - 500000n) / 100n)
  }
}

const fetch: FetchV2 = async ({ getLogs, createBalances, chain, api }: FetchOptions): Promise<FetchResultV2> => {
  const typedChain = chain as SupportedChains

  const dailyVolume = createBalances()
  const dailyFees = createBalances()

  const takeEvents = await getLogs({ target: bookManagerContract[typedChain], eventAbi: abi.take, })
  let swapEvents = []
  let feeCollectedEvents = []
  if(routerGatewayContract[typedChain]) {
    swapEvents = await getLogs({ target: routerGatewayContract[typedChain], eventAbi: abi.swap, })
    feeCollectedEvents = await getLogs({ target: routerGatewayContract[typedChain], eventAbi: abi.feeCollected, })
  }

  const bookKeys = takeEvents.map(i => i.bookId.toString())
  const books = await api.multiCall({ abi: abi.getBookKey, calls: bookKeys, target: bookManagerContract[typedChain] })
  takeEvents.forEach((i, idx) => {
    const quoteAmount = Number(i.unit) * Number(books[idx].unitSize)
    dailyVolume.add(books[idx].quote, quoteAmount)
    const { bps, usesQuote } = parseFeeInfo(BigInt(books[idx].takerPolicy))
    if (usesQuote) {
      dailyFees.add(books[idx].quote, (quoteAmount * bps) / 10000)
    }
  })

  swapEvents.forEach((i) => dailyVolume.add(i.outToken, Number(i.amountOut)))
  feeCollectedEvents.forEach((i) => dailyFees.add(i.token, Number(i.amount)))

  return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, dailyHoldersRevenue: '0' };
};

const adapter: SimpleAdapter = {
  methodology: {
    Volume: 'Volume is calculated by summing the quote token volume of all trades on the protocol.',
    Fees: 'fees include the portion captured by the meta aggregator from the spread between the best quote and the second best quote',
    Revenue: "All fees are revenue.",
    ProtocolRevenue: "All fees are protocol revenue.",
    HoldersRevenue: "No Holders Revenue",
  },
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
    [CHAIN.MONAD]: {
      fetch,
      start: '2025-11-24',
    },
  }
};

export default adapter;
