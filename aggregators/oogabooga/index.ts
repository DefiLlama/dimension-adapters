import type { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const swapEvent =
	"event Swap(address indexed sender,uint256 inputAmount,address indexed inputToken,uint256 amountOut,address indexed outputToken,int256 slippage,uint32 referralCode,address to)";

async function fetch({ getLogs, createBalances }: FetchOptions) {
	const dailyVolume = createBalances();
	const logs = await getLogs({
		targets: ["0xFd88aD4849BA0F729D6fF4bC27Ff948Ab1Ac3dE7"],
		eventAbi: swapEvent,
	});

	for (const l of logs) {
		dailyVolume.add(l.outputToken, l.amountOut);
	}

	return { dailyVolume };
}

export default {
	version: 2,
	adapter: {
		[CHAIN.BERACHAIN]: {
			fetch: fetch,
			start: 324008,
		},
	},
};
