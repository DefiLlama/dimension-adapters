import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const event_swap = 'event Swap(address indexed sender,address indexed to,uint24 id,bytes32 amountsIn,bytes32 amountsOut,uint24 volatilityAccumulator,bytes32 totalFees,bytes32 protocolFees)';
const FACTORY_ADDRESS = '0x8597db3ba8de6baadeda8cba4dac653e24a0e57b';

type TABI = {
	[k: string]: string;
}
const ABIs: TABI = {
	"getNumberOfLBPairs": "uint256:getNumberOfLBPairs",
	"getLBPairAtIndex": "function getLBPairAtIndex(uint256 index) view returns (address lbPair)"
}

const fetch: any = async (timestamp: number, _: ChainBlocks, { getLogs, api, createBalances }: FetchOptions) => {
	const dailyVolume = createBalances();
	const lpTokens = await api.fetchList({ lengthAbi: ABIs.getNumberOfLBPairs, itemAbi: ABIs.getLBPairAtIndex, target: FACTORY_ADDRESS })

	const [tokens0, tokens1] = await Promise.all(['address:getTokenX', 'address:getTokenY'].map((abi: string) => api.multiCall({ abi, calls: lpTokens, })));

	const logs: any[][] = await getLogs({
		targets: lpTokens,
		flatten: false,
		eventAbi: event_swap,
	}) as any;

	logs.forEach((logs: any[], index: number) => {
		const token0 = tokens0[index];
		const token1 = tokens1[index];
		logs.forEach((log: any) => {
			const amountInX = Number('0x' + '0'.repeat(32) + log.amountsOut.replace('0x', '').slice(0, 32))
			const amountInY = Number('0x' + '0'.repeat(32) + log.amountsOut.replace('0x', '').slice(32, 64))
			dailyVolume.add(token1, amountInX);
			dailyVolume.add(token0, amountInY);
		})
	})

	return { dailyVolume, timestamp, };
}

const adapter: SimpleAdapter = {
	adapter: {
		[CHAIN.FANTOM]: { fetch, start: '2023-04-10', },
		[CHAIN.ARBITRUM]: { fetch, start: '2023-06-11', },
		[CHAIN.BASE]: { fetch, start: '2023-08-09', }
	}
};

export default adapter;
