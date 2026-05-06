import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";
import { filterPools } from "../../helpers/uniswap";

const factory = '0x2566163ea012c9e67c1c7080e0a073f20b548030';
const poolCreatedEvent = 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)';
const swapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)';

const fetch = async (options: FetchOptions) => {
	const { createBalances, getLogs, chain, api } = options;
	const dailyVolume = createBalances();
	const dailyFees = createBalances();
	const dailyRevenue = createBalances();
	const dailySupplySideRevenue = createBalances();

	const poolLogs = await getLogs({ target: factory, eventAbi: poolCreatedEvent, fromBlock: 4584580, cacheInCloud: true });
	const pairObject: Record<string, string[]> = {};
	const fees: Record<string, number> = {};

	poolLogs.forEach((log: any) => {
		pairObject[log.pool] = [log.token0, log.token1];
		fees[log.pool] = (log.fee?.toString() || 0) / 1e6;
	});

	const filteredPairs = await filterPools({ api, pairs: pairObject, createBalances });
	if (!Object.keys(filteredPairs).length) return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue: dailyRevenue };

	const allLogs = await getLogs({ targets: Object.keys(filteredPairs), eventAbi: swapEvent, flatten: false });
	allLogs.forEach((logs: any, index: number) => {
		if (!logs.length) return;
		const pair = Object.keys(filteredPairs)[index];
		const [token0, token1] = pairObject[pair];
		const fee = fees[pair];
		logs.forEach((log: any) => {
			// https://docs.upheaval.fi/fees
			const revenueRatio = fee * 0.33; // Treasury
			const supplyRatio = fee * 0.67; // LP providers
			addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0, amount1: log.amount1 });
			addOneToken({ chain, balances: dailyFees, token0, token1, amount0: log.amount0.toString() * fee, amount1: log.amount1.toString() * fee });
			addOneToken({ chain, balances: dailyRevenue, token0, token1, amount0: log.amount0.toString() * revenueRatio, amount1: log.amount1.toString() * revenueRatio });
			addOneToken({ chain, balances: dailySupplySideRevenue, token0, token1, amount0: log.amount0.toString() * supplyRatio, amount1: log.amount1.toString() * supplyRatio });
		});
	});

	return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue: dailyRevenue };
};

const adapter: SimpleAdapter = {
	version: 2,
    pullHourly: true,
    fetch,
    start: '2025-08-06',
    chains: [CHAIN.HYPERLIQUID],
};

export default adapter;
