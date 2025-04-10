import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { addTokensReceived } from '../../helpers/token';

const ECHO_v1_DEAL_FACTORY = '0x32885c0174FBd53A3BDf418408415c7bEF679810'
const ECHO_v2_DEAL_FACTORY = '0xB6D2c5dc2d181E0E1D031F2b3B76Ea8b678EAA46'
const ECHO_FEE_RECEIVER = '0x395426cE9081aE5ceA3f9fBA3078B00f16E7aE21'

const fetchFees = async (options: FetchOptions) => {
  const toBlock = await options.getBlock(options.toTimestamp, options.chain, {})
  const v1logs = await options.getLogs({
    target: ECHO_v1_DEAL_FACTORY,
    eventAbi: "event DealCreated (bytes16 indexed uuid, address indexed dealAddress)",
    fromBlock: 12370761,
    toBlock: toBlock,
  })
  const v2logs = await options.getLogs({
    target: ECHO_v2_DEAL_FACTORY,
    eventAbi: "event DealCreated (bytes16 indexed uuid, address indexed dealAddress)",
    fromBlock: 18771345,
    toBlock: toBlock,
  })

  const dealAddresses = [...v1logs.map((log: any) => log.dealAddress), ...v2logs.map((log: any) => log.dealAddress)];

  const dailyFees = await addTokensReceived({ options, fromAdddesses: dealAddresses, target: ECHO_FEE_RECEIVER })

  return {
    dailyFees: dailyFees,
    dailyRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchFees,
      start: '2024-03-27',
    }
  }
}
export default adapter
