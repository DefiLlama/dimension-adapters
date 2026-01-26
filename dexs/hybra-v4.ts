import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addOneToken } from "../helpers/prices";
import { formatAddress } from "../utils/utils";

const swapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'
const SetCustomFeeEvent = 'event SetCustomFee(address indexed pool, uint24 indexed fee)'

const FACTORY = '0x32b9dA73215255d50D84FeB51540B75acC1324c2';
const CUSTOM_FEE_CONTRACT = '0x4992d95c26297ae7b08544f4d59bc870e3134ab7';

// Default fee mapping based on tickSpacing (from Hybra V4 factory initialization)
// enableTickSpacing(tickSpacing, fee) where fee is in basis points (1e6 = 100%)
const TICK_SPACING_TO_FEE: {[key: number]: number} = {
	1: 100 / 1e6,      // 0.01%
	10: 500 / 1e6,     // 0.05%
	50: 2500 / 1e6,    // 0.25%
	100: 5000 / 1e6,   // 0.5%
	200: 10000 / 1e6,  // 1%
	2000: 10000 / 1e6, // 1%
};

interface FeeEvent {
	blockNumber: number;
	fee: number;
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

	const pairObject: Record<string, Array<string>> = {}
	for (let i = 0; i < Number(allPoolsLength); i++) {
		pairObject[allPools[i]] = [
			token0Addresses[i],
			token1Addresses[i],
		]
	}

	const allLogs = await options.getLogs({
		targets: allPools,
		eventAbi: swapEvent,
		flatten: false
	});

	const dailyVolume = options.createBalances();
	allLogs.forEach((logs, index) => {
		if (!logs.length) return;
		const pool = allPools[index];
		const [token0, token1] = pairObject[pool];

		for (const log of logs) {
			addOneToken({
				chain: options.chain,
				balances: dailyVolume,
				token0,
				token1,
				amount0: log.amount0.toString(),
				amount1: log.amount1.toString()
			});
		}
	})

	return await customLogic({ pairObject, dailyVolume, allLogs, fetchOptions: options })
}

const customLogic = async ({ pairObject, dailyVolume, allLogs, fetchOptions }: any) => {
	const { api, chain, createBalances } = fetchOptions;
  const poolAddresses = Object.keys(pairObject);
	
  const feeHistory: {[pool: string]: FeeEvent[]} = {};
  const setCustomFeesEvents = await fetchOptions.getLogs({
    target: CUSTOM_FEE_CONTRACT,
    eventAbi: SetCustomFeeEvent,
    fromBlock: 16716093,
    cacheInCloud: true,
  });
  for (const log of setCustomFeesEvents) {
    const pool = formatAddress(log.pool)
    feeHistory[pool] = feeHistory[pool] || [];
    feeHistory[pool].push({
			blockNumber: parseInt(log.block_number),
			fee: parseFloat(log.fee) / 1e6
		});
  }

	// Sort fee events by blockNumber and timestamp (already sorted by query, but ensure consistency)
	Object.keys(feeHistory).forEach(pool => {
		feeHistory[pool].sort((a, b) => {
		  return a.blockNumber - b.blockNumber;
		});
	});

	// 3. Get default fees based on tickSpacing for pools without custom fees
	const tickSpacings = await api.multiCall({
		abi: 'function tickSpacing() view returns (int24)',
		calls: poolAddresses,
		permitFailure: true
	});

	const defaultFees: {[pool: string]: number} = {};
	tickSpacings.forEach((tickSpacing: any, i: number) => {
		if (tickSpacing !== null) {
			const pool = poolAddresses[i];
			const absTickSpacing = Math.abs(tickSpacing);
			defaultFees[pool] = TICK_SPACING_TO_FEE[absTickSpacing] || 0.003; // Default to 0.3%
		}
	});

	// 4. Process each swap with the correct historical fee
	const dailyFees = createBalances();
	allLogs.forEach((logs: any, index: number) => {
		if (!logs.length) return;
		const pool = poolAddresses[index];
		const [token0, token1] = pairObject[pool];

		logs.forEach((log: any) => {
			// Find the applicable fee at the time of this swap
			let fee = defaultFees[pool]

			const poolFeeHistory = feeHistory[pool];
			if (poolFeeHistory && poolFeeHistory.length > 0) {
				// Find the most recent fee change before or at this swap's block
				for (let i = poolFeeHistory.length - 1; i >= 0; i--) {
					const feeEvent = poolFeeHistory[i];
					if (feeEvent.blockNumber <= log.blockNumber) {
						fee = feeEvent.fee;
						break;
					}
				}
			}

			addOneToken({
				chain,
				balances: dailyFees,
				token0,
				token1,
				amount0: log.amount0.toString() * fee,
				amount1: log.amount1.toString() * fee
			});
		});
	});
	
	// fees change from Thu Nov 20 2025 00:00:00 GMT+0000
	if (fetchOptions.startOfDay < 1763596800) {
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
};

const adapter: SimpleAdapter = {
	version: 2,
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
