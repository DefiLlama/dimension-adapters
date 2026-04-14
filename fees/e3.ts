import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

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
	const dailySupplySideRevenue = createBalances();

	const [tokenXs, tokenYs] = await Promise.all(
		['address:getTokenX', 'address:getTokenY'].map((method: string) =>
			api.multiCall({
				abi: method,
				calls: lpTokens,
			})
		)
	);

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
				const protocolFeesY = Number('0x' + p.protocolFees.replace('0x', '').slice(0, 32));
				const protocolFeesX = Number('0x' + p.protocolFees.replace('0x', '').slice(32, 64));
				const totalFeesY = Number('0x' + p.totalFees.replace('0x', '').slice(0, 32));
				const totalFeesX = Number('0x' + p.totalFees.replace('0x', '').slice(32, 64));
				dailyFees.add(token0, totalFeesX, METRIC.TRADING_FEES)
				dailyFees.add(token1, totalFeesY, METRIC.TRADING_FEES)
				dailyRevenue.add(token0, protocolFeesX, METRIC.TOKEN_BUY_BACK)
				dailyRevenue.add(token1, protocolFeesY, METRIC.TOKEN_BUY_BACK)
				dailySupplySideRevenue.add(token0, Number(totalFeesX) - Number(protocolFeesX), METRIC.LP_FEES)
				dailySupplySideRevenue.add(token1, Number(totalFeesY) - Number(protocolFeesY), METRIC.LP_FEES)
			});
	});

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

const breakdownMethodology = {
	Fees: {
		[METRIC.TRADING_FEES]: "Total trading fees charged in token X on each LB pair swap",
	},
	Revenue: {
		[METRIC.TOKEN_BUY_BACK]: "Variable percentage of token X trading fees collected as protocol revenue",
	},
	SupplySideRevenue: {
		[METRIC.LP_FEES]: "Total LP fees sent to liquidity providers",
	}
}

const adapter: SimpleAdapter = {
	version: 2,
	pullHourly: true,
	fetch,
	adapter: {
		[CHAIN.FANTOM]: { start: '2023-04-10', },
		[CHAIN.ARBITRUM]: { start: '2023-06-11', },
		[CHAIN.BASE]: { start: '2023-08-09' }
	},
	methodology,
	breakdownMethodology,
};

export default adapter;
