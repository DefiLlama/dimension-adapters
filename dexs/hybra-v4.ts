import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV3LogAdapter } from "../helpers/uniswap";
import { addOneToken } from "../helpers/prices";

const poolCreatedEvent = 'event PoolCreated(address indexed token0, address indexed token1, int24 indexed tickSpacing, address pool)'
const swapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'
const setCustomFeeEvent = 'event SetCustomFee(address indexed pool, uint24 indexed fee)';

const FEE_MANAGER = '0xbEc2Bf10B7172C8E5621569bD285E9adB1806426';

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
	logIndex: number;
	fee: number;
}

const customLogic = async ({ pairObject, dailyVolume, filteredPairs, fetchOptions }: any) => {
	const { api, getLogs, chain, createBalances } = fetchOptions;
	const poolAddresses = Object.keys(filteredPairs);

	// 1. Get all SetCustomFee events to track fee history
	const feeEvents = await getLogs({
		target: FEE_MANAGER,
		eventAbi: setCustomFeeEvent,
	});

	// 2. Build fee history mapping: pool -> [(blockNumber, logIndex, fee)]
	const feeHistory: {[pool: string]: FeeEvent[]} = {};
	feeEvents.forEach((event: any) => {
		const pool = event.pool.toLowerCase();
		if (!feeHistory[pool]) {
			feeHistory[pool] = [];
		}
		feeHistory[pool].push({
			blockNumber: event.blockNumber,
			logIndex: event.logIndex,
			fee: Number(event.fee) / 1e6
		});
	});

	// Sort fee events by blockNumber and logIndex
	Object.keys(feeHistory).forEach(pool => {
		feeHistory[pool].sort((a, b) => {
			if (a.blockNumber !== b.blockNumber) {
				return a.blockNumber - b.blockNumber;
			}
			return a.logIndex - b.logIndex;
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
			const pool 
			= poolAddresses[i];
			const absTickSpacing = Math.abs(tickSpacing);
			defaultFees[pool] = TICK_SPACING_TO_FEE[absTickSpacing] || 0.003; // Default to 0.3%
		}
	});

	// 4. Get swap events
	const dailyFees = createBalances();
	const allLogs = await getLogs({
		targets: poolAddresses,
		eventAbi: swapEvent,
		flatten: false
	});

	// 5. Process each swap with the correct historical fee
	allLogs.forEach((logs: any, index: number) => {
		if (!logs.length) return;
		const pool = poolAddresses[index];
		const [token0, token1] = pairObject[pool];

		logs.forEach((log: any) => {
			// Find the applicable fee at the time of this swap
			let fee = defaultFees[pool] || 0.003;

			const poolFeeHistory = feeHistory[pool];
			if (poolFeeHistory && poolFeeHistory.length > 0) {
				// Find the most recent fee change before or at this swap
				// If same block, the fee change must have lower logIndex (occurred before the swap)
				for (let i = poolFeeHistory.length - 1; i >= 0; i--) {
					const feeEvent = poolFeeHistory[i];
					if (feeEvent.blockNumber < log.blockNumber ||
						(feeEvent.blockNumber === log.blockNumber && feeEvent.logIndex < log.logIndex)) {
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

	return {
		dailyVolume,
		dailyFees,
		dailyUserFees: dailyFees,
		dailyRevenue: dailyFees.clone(0.25),
		dailyProtocolRevenue: dailyFees.clone(0.25),
		dailySupplySideRevenue: dailyFees.clone(0.75),
	};
};

const adapter: SimpleAdapter = {
	version: 2,
	methodology: {
		Volume: 'Total swap volume collected from factory 0x32b9dA73215255d50D84FeB51540B75acC1324c2',
		Fees: 'Users paid dynamic fees per swap.',
		UserFees: 'Users paid dynamic fees per swap.',
		Revenue: '25% swap fees collected by protocol Treasury.',
		ProtocolRevenue: '25% swap fees collected by protocol Treasury.',
		SupplySideRevenue: '75% swap fees distributed to LPs.',
	},
	start: '2025-10-17',
	chains: [CHAIN.HYPERLIQUID],
	fetch: getUniV3LogAdapter({
		factory: '0x32b9dA73215255d50D84FeB51540B75acC1324c2',
		poolCreatedEvent,
		swapEvent,
		customLogic
	}),
}

export default adapter
