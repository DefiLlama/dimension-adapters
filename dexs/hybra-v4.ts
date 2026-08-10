import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addOneToken } from "../helpers/prices";

const swapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'

const FACTORY = '0x32b9dA73215255d50D84FeB51540B75acC1324c2';

function getSwapArgs(log: any) {
	const args = log.args ?? log;
	return { amount0: args.amount0, amount1: args.amount1 };
}

async function fetch(options: FetchOptions) {
	const allPoolsLength = await options.api.call({
		target: FACTORY,
		abi: 'uint256:allPoolsLength',
	});
	const allPoolsCalls: any = [];
	for (let i = 0; i < Number(allPoolsLength); i++) {
		allPoolsCalls.push({ params: [i] })
	}
	const allPools = await options.api.multiCall({
		target: FACTORY,
		abi: 'function allPools(uint) view returns (address)',
		calls: allPoolsCalls,
	});

	const token0Addresses = await options.api.multiCall({ abi: 'address:token0', calls: allPools });
	const token1Addresses = await options.api.multiCall({ abi: 'address:token1', calls: allPools });

	// Read effective fee from each pool on-chain (includes dynamic fee + discount)
	const poolFees = await options.api.multiCall({
		abi: 'function fee() view returns (uint24)',
		calls: allPools,
		permitFailure: true,
	});

	const pairObject: Record<string, Array<string>> = {}
	const feeByPool: Record<string, number> = {}
	for (let i = 0; i < Number(allPoolsLength); i++) {
		pairObject[allPools[i]] = [
			token0Addresses[i],
			token1Addresses[i],
		]
		feeByPool[allPools[i]] = poolFees[i] !== null ? Number(poolFees[i]) / 1e6 : 0;
	}

	// onlyArgs=false to preserve raw log metadata and allow args access via log.args
	const allLogs = await options.getLogs({
		targets: allPools,
		eventAbi: swapEvent,
		flatten: false,
		onlyArgs: false,
	} as any);

	const dailyVolume = options.createBalances();
	const dailyFees = options.createBalances();

	allLogs.forEach((logs, index) => {
		if (!logs.length) return;
		const pool = allPools[index];
		const [token0, token1] = pairObject[pool];
		const fee = feeByPool[pool];

		for (const log of logs) {
			const a = getSwapArgs(log);

			addOneToken({
				chain: options.chain,
				balances: dailyVolume,
				token0,
				token1,
				amount0: a.amount0.toString(),
				amount1: a.amount1.toString()
			});

			addOneToken({
				chain: options.chain,
				balances: dailyFees,
				token0,
				token1,
				amount0: a.amount0.toString() * fee,
				amount1: a.amount1.toString() * fee
			});
		}
	})

	// fees change from Thu Nov 20 2025 00:00:00 GMT+0000
	if (options.startOfDay < 1763596800) {
	  return {
  		dailyVolume,
  		dailyFees,
  		dailyUserFees: dailyFees,
  		dailyRevenue: dailyFees.clone(0.25),
  		dailyProtocolRevenue: dailyFees.clone(0.25),
  		dailySupplySideRevenue: dailyFees.clone(0.75),
  		dailyHoldersRevenue: 0,
  	};
	} else {
  	return {
  		dailyVolume,
  		dailyFees,
  		dailyUserFees: dailyFees,
  		dailyRevenue: dailyFees,
  		dailyProtocolRevenue: 0,
  		dailySupplySideRevenue: 0,
  		dailyHoldersRevenue: dailyFees,
  	};
	}
}

const adapter: SimpleAdapter = {
	version: 2,
	pullHourly: true,
	methodology: {
		Volume: `Total swap volume collected from factory ${FACTORY}`,
		Fees: 'All swap fees paid by users.',
		UserFees: 'All swap fees paid by users.',
		Revenue: 'All swap fees are revenue.',
		ProtocolRevenue: 'Protocol makes no revenue.',
		SupplySideRevenue: 'No fees distributed to LPs.',
		HoldersRevenue: 'All revenue distributed to veHYBRA holders.',
	},
	start: '2025-10-17',
	chains: [CHAIN.HYPERLIQUID],
	fetch,
}

export default adapter
