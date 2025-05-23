import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const abis = {
  "Swap": "event Swap(address indexed sender, uint256 inputAmount, address indexed inputToken, uint256 amountOut, address indexed outputToken, address to)",
}

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()

  const logs = await options.getLogs({ target: '0x5d23a4639f8f72A7bF4a33Fd74351cCfFF08C191', eventAbi: abis.Swap, })
  logs.forEach((log: any) => {
    dailyVolume.add(log.inputToken, log.inputAmount)
  })
  return { dailyVolume }
};

const adapter: SimpleAdapter = {
	version: 2,
	adapter: {
		[CHAIN.STORY]: {
			fetch,
			start: '2025-05-19',
		},
	},
};

export default adapter;