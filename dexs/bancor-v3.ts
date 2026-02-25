import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

async function fetchV3(fetchOptions: FetchOptions) {
  const { getLogs, createBalances } = fetchOptions
  const contract = '0xeEF417e1D5CC832e619ae18D2F140De2999dD4fB'
  const dailyVolume = createBalances()
  const logs = await getLogs({ targets: [contract], eventAbi: 'event TokensTraded(bytes32 indexed contextId, address indexed sourceToken, address indexed targetToken, uint256 sourceAmount, uint256 targetAmount, uint256 bntAmount, uint256 targetFeeAmount, uint256 bntFeeAmount, address trader)' })
  logs.forEach((log: any) => dailyVolume.add(log.targetToken, log.targetAmount))
  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchV3,
    }
  }
}

export default adapter;
