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
	const dailyUserFees = createBalances();
	const dailyRevenue = createBalances();
	const dailyHoldersRevenue = createBalances();
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
				dailyFees.add(token0, totalFeesX, "Swap fees collected from LB pair trades (token X)")
				dailyFees.add(token1, totalFeesY, "Swap fees collected from LB pair trades (token Y)")
				dailyUserFees.add(token0, totalFeesX, "Trading fees paid by users on swaps (token X)")
				dailyUserFees.add(token1, totalFeesY, "Trading fees paid by users on swaps (token Y)")
				dailyRevenue.add(token0, protocolFeesX, "Protocol fees retained from swaps (token X)")
				dailyRevenue.add(token1, protocolFeesY, "Protocol fees retained from swaps (token Y)")
				dailyHoldersRevenue.add(token0, protocolFeesX, "Fees allocated to ELITE buybacks (token X)")
				dailyHoldersRevenue.add(token1, protocolFeesY, "Fees allocated to ELITE buybacks (token Y)")
			});
	});

	const dailySupplySideRevenue = dailyFees.clone();
	dailySupplySideRevenue.subtract(dailyRevenue);

	return {
		dailyFees,
		dailyUserFees,
		dailyRevenue,
		dailyProtocolRevenue: 0,
		dailyHoldersRevenue,
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

const breakdownMethodology = {
	"Swap fees collected from LB pair trades (token X)": "Total trading fees charged in token X on each LB pair swap",
	"Swap fees collected from LB pair trades (token Y)": "Total trading fees charged in token Y on each LB pair swap",
	"Trading fees paid by users on swaps (token X)": "Fees paid by users in token X when executing swaps, including flash loan fees",
	"Trading fees paid by users on swaps (token Y)": "Fees paid by users in token Y when executing swaps, including flash loan fees",
	"Protocol fees retained from swaps (token X)": "Variable percentage of token X trading fees collected as protocol revenue",
	"Protocol fees retained from swaps (token Y)": "Variable percentage of token Y trading fees collected as protocol revenue",
	"Fees allocated to ELITE buybacks (token X)": "Protocol fees in token X directed to ELITE token buybacks",
	"Fees allocated to ELITE buybacks (token Y)": "Protocol fees in token Y directed to ELITE token buybacks",
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
	breakdownMethodology,
};

export default adapter;
