import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const event_swap = 'event Swap(address indexed sender,address indexed to,uint24 id,bytes32 amountsIn,bytes32 amountsOut,uint24 volatilityAccumulator,bytes32 totalFees,bytes32 protocolFees)';
const FACTORY_ADDRESS = '0x8597db3ba8de6baadeda8cba4dac653e24a0e57b';


type TABI = {
	[k: string]: string;
}
const ABIs: TABI = {
	"getNumberOfLBPairs": "uint256:getNumberOfLBPairs",
	"getLBPairAtIndex": "function getLBPairAtIndex(uint256 index) view returns (address lbPair)"
}

const fetch = async ({ createBalances, api, getLogs }: FetchOptions) => {
	const lpTokens = await api.fetchList({ lengthAbi: ABIs.getNumberOfLBPairs, itemAbi: ABIs.getLBPairAtIndex, target: FACTORY_ADDRESS })
	const dailyFees = createBalances();
	const dailyRevenue = createBalances();
	const [tokenXs, tokenYs] = await Promise.all(
		['address:getTokenX', 'address:getTokenY'].map((method: string) =>
			api.multiCall({
				abi: method,
				calls: lpTokens,
			})
		)
	);
	const decimalsXs = await api.multiCall({ abi: 'erc20:decimals', calls: tokenXs })
	const decimalsYs = await api.multiCall({ abi: 'erc20:decimals', calls: tokenYs })

	const logs: any[][] = await getLogs({
		targets: lpTokens,
		eventAbi: event_swap,
		flatten: false,
	})

	lpTokens.map((_: string, index: number) => {
		logs[index]
			.map((p: any) => {
				const token0 = tokenXs[index];
				const token1 = tokenYs[index];
				const decimalsX = decimalsXs[index];
				const decimalsY = decimalsYs[index];
				const protocolFeesY = Number('0x' + p.protocolFees.replace('0x', '').slice(0, 32));
				const protocolFeesX = Number('0x' + p.protocolFees.replace('0x', '').slice(32, 64));
				const totalFeesY = Number('0x' + p.totalFees.replace('0x', '').slice(0, 32));
				const totalFeesX = Number('0x' + p.totalFees.replace('0x', '').slice(32, 64));
				dailyFees.add(token0, totalFeesX )
				dailyFees.add(token1, totalFeesY )
				dailyRevenue.add(token0, protocolFeesX)
				dailyRevenue.add(token1, protocolFeesY)
			});
	});

	const dailySupplySideRevenue = dailyFees.clone();
	dailySupplySideRevenue.subtract(dailyRevenue);
	
	return {
		dailyFees,
		dailyUserFees: dailyFees,
		dailyRevenue,
		dailyProtocolRevenue: 0,
		dailyHoldersRevenue: dailyRevenue,
		dailySupplySideRevenue,
	};
}

const methodology = {
	UserFees: "EⅢ users pay a Trading fee on each swap. Includes Flash Loan Fees.",
	Fees: "Net Trading fees paid is the Sum of fees sent to LP & Protocol Fees",
	Revenue: "A variable % of the trading fee is collected as Protocol Fees.",
	ProtocolRevenue: "All Revenue goes to buyback ELITE.",
	HoldersRevenue: "100% of Revenue is used to buyback ELITE.",
	SupplySideRevenue: "The portion of trading fees paid to liquidity providers."
}

const adapter: SimpleAdapter = {
	version: 2,
	adapter: {
		[CHAIN.FANTOM]: {
			fetch,
			start: '2023-04-10',
		},
		[CHAIN.ARBITRUM]: {
			fetch,
			start: '2023-06-11',
		},
		[CHAIN.BASE]: {
			fetch,
			start: '2023-08-09',
		}
	},
	methodology,
};

export default adapter;
