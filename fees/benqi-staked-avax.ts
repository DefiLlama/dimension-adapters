import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const topic0 = 'event AccrueRewards(uint256 userRewardAmount,uint256 protocolRewardAmount)';
const address = '0x2b2c81e08f1af8835a78bb2a90ae924ace0ea4be'

const fetchFees = async ({ createBalances, getLogs, }: FetchOptions) => {
  const dailyFees = createBalances()
  const logs = await getLogs({ target: address, eventAbi: topic0 })
  logs.map((log) => dailyFees.add('0x2b2c81e08f1af8835a78bb2a90ae924ace0ea4be', log.protocolRewardAmount))
  dailyFees.resizeBy(1 / 0.9)
  const dailyRevenue = dailyFees.clone(0.1)
  const dailySupplySideRevenue = dailyFees.clone(0.9)
  return { dailyFees, dailyRevenue, dailySupplySideRevenue }
}

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetchFees,
      start: '2022-02-13'
    }
  }
}
export default adapters;
