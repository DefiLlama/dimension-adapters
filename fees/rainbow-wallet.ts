import { Adapter, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTokenDiff } from "../helpers/token";

const rainbowRouter = '0x00000000009726632680fb29d3f7a9734e3010e2'

const fetch: any = async (timestamp: number, _: any, options: FetchOptions) => {
  const { createBalances, getLogs, } = options
  const dailyFees = createBalances()

  const ethLogs = await getLogs({ target: rainbowRouter, eventAbi: 'event EthWithdrawn(address indexed target, uint256 amount)' })
  const tokenLogs = await getLogs({ target: rainbowRouter, eventAbi: 'event TokenWithdrawn(address indexed token, address indexed target, uint256 amount)' })
  let extraTokens = new Set<string>()

  ethLogs.forEach((log: any) => dailyFees.addGasToken(log.amount))
  tokenLogs.forEach((log: any) => {
    extraTokens.add(log.token)
    dailyFees.add(log.token, log.amount)
  })

  await getTokenDiff({ options, target: rainbowRouter, balances: dailyFees, extraTokens: [...extraTokens], })
  dailyFees.removeNegativeBalances()

  return {
    timestamp,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const methodology = {
  Fees: "Take 0.85% from trading volume",
  Revenue: "Take 0.85% from trading volume",
}

const chainAdapter = { fetch, start: 1672531200, meta: { methodology } }

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: chainAdapter,
    [CHAIN.OPTIMISM]: chainAdapter,
    [CHAIN.ARBITRUM]: chainAdapter,
    [CHAIN.POLYGON]: chainAdapter,
    [CHAIN.BASE]: chainAdapter,
    [CHAIN.BSC]: chainAdapter,
    [CHAIN.AVAX]: chainAdapter,
  },

}

export default adapter;
