import { ChainBlocks, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";

const event_swap = 'event Swap(address indexed sender,address indexed to,uint24 id,bytes32 amountsIn,bytes32 amountsOut,uint24 volatilityAccumulator,bytes32 totalFees,bytes32 protocolFees)';
const FACTORY_ADDRESS = '0x8597db3ba8de6baadeda8cba4dac653e24a0e57b';


type TABI = {
	[k: string]: string;
}
const ABIs: TABI = {
	"getNumberOfLBPairs": "uint256:getNumberOfLBPairs",
	"getLBPairAtIndex": "function getLBPairAtIndex(uint256 index) view returns (address lbPair)"
}

const graph = (_chain: Chain) => {
	return async (timestamp: number, _: ChainBlocks, { createBalances, api, getLogs, }: FetchOptions) => {

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
          const protocolFeesY = Number('0x' + p.protocolFees.replace('0x', '').slice(0, 32))
          const protocolFeesX = Number('0x' + p.protocolFees.replace('0x', '').slice(32, 64))
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
			dailyFees: dailyFees,
			dailyUserFees: dailyFees,
			dailyRevenue: dailyRevenue,
			dailyProtocolRevenue: dailyRevenue,
			dailyHoldersRevenue: dailyRevenue,
			dailySupplySideRevenue,
			timestamp,
		};
	}
}

const methodology = {
	UserFees: "EⅢ users pay a Trading fee on each swap. Includes Flash Loan Fees.",
	Fees: "Net Trading fees paid is the Sum of fees sent to LP & Protocol Fees",
	Revenue: "A variable % of the trading fee is collected as Protocol Fees.",
	ProtocolRevenue: "100% of Revenue is collected by Protocol Treasury.",
	HoldersRevenue: "100% of Revenue is used to buyback ELITE.",
	SupplySideRevenue: "The portion of trading fees paid to liquidity providers."
}

const adapter: SimpleAdapter = {
	adapter: {
		[CHAIN.FANTOM]: {
			fetch: graph(CHAIN.FANTOM),
			start: 1681130543,
			meta: { methodology }
		},
		[CHAIN.ARBITRUM]: {
			fetch: graph(CHAIN.ARBITRUM),
			start: 1686459416,
			meta: { methodology }
		},
		[CHAIN.BASE]: {
			fetch: graph(CHAIN.BASE),
			start: 1691547000,
			meta: { methodology }
		}
	}
};

export default adapter;
