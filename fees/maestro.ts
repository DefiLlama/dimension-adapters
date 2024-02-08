import { CHAIN } from "../helpers/chains";
import { Adapter, FetchOptions, } from "../adapters/types";
import { getTokenDiff } from "../helpers/token";

const dispatcher: any = {
  [CHAIN.ETHEREUM]: "0x7776607E2E0bD61052e60d59F1fDd11dFbeC27e8",
  [CHAIN.BSC]: "0xB8c4879D4cF2ABF672C4b59Ed9d1226ab53E9C7f",
  [CHAIN.ARBITRUM]: "0x7776607E2E0bD61052e60d59F1fDd11dFbeC27e8",
}
const feesAddress = '0xcac0f1a06d3f02397cfb6d7077321d73b504916e'

async function fetch(timestamp: number, _1: any, options: FetchOptions) {
  const dailyFees = options.createBalances()
  await getTokenDiff({ options, target: feesAddress, balances: dailyFees, tokens: [] })
  const logs = await options.getLogs({ target: dispatcher[options.chain], eventAbi: 'event BalanceTransfer (address to, uint256 amount)', })
  logs.map((log: any) => dailyFees.addGasToken(log.amount))
  return { timestamp, dailyFees, dailyRevenue: dailyFees, }
}

const chainAdapter = { fetch: fetch as any, start: 1656633600, }

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: chainAdapter,
    [CHAIN.BSC]: chainAdapter,
    [CHAIN.ARBITRUM]: chainAdapter,
  }
}

export default adapter;
