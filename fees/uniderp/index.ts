import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ZeroAddress } from "ethers";
import * as sdk from '@defillama/sdk';
import PromisePool from "@supercharge/promise-pool";

const LAUNCH_FEE = 0.00069; // 0.00069 ETH for each token created
const config = {
	[CHAIN.UNICHAIN]: {
		poolManager: "0x1f98400000000000000000000000000000000004",
		uniderpLauncher: "0x239584404983804085c8Fd69C1e1651ea99680b0",
		uniderpHook: "0xb4960cd4f9147f9e37a7aa9005df7156f61e4444",
		start: "2025-04-23",
		fromBlock: 14569072
	},
}

const SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";

const hookEventAbi = "event FeeTaken(uint8 indexed feeType, address indexed token, address indexed receiver, uint256 amount)"
const launcherEventAbi = "event TokenCreated(uint256 lpTokenId, address tokenAddress, address indexed creatorAddress, string symbol, int24 startingTickIfToken0IsNewToken, uint256 amountTokensBought)"
const swapAbi = "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)"
const poolV4Abi = 'event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)'

const getAbsoluteBigInt = (value: bigint): bigint => {
	return value < BigInt(0) ? value * BigInt(-1) : value;
};

const fetchFees = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResult> => {
	const { getLogs, createBalances, getToBlock, getFromBlock } = options;
	const [toBlock, fromBlock] = await Promise.all([getToBlock(), getFromBlock()])

	const { poolManager, uniderpLauncher, fromBlock: configFromBlock, uniderpHook } = config[options.chain]

	const dailyFees = createBalances();
	const dailyProtocolRevenue = createBalances();

	// events from hook
	const hookLogs = await getLogs({
		target: uniderpHook,
		skipIndexer: true,
		eventAbi: hookEventAbi,
	});

	for (const log of hookLogs) {
		// Fee taken from hook: platform (20%) + token creator (40%) + referrer fee (10%)
		dailyFees.addToken(log.token, log.amount);
		if (log.feeType === 0n) {
			// platform (20%)
			dailyProtocolRevenue.addToken(log.token, log.amount);
		}
	}

	// events from launching new token
	const launcherLogs = await getLogs({
		target: uniderpLauncher,
		skipIndexer: true,
		eventAbi: launcherEventAbi,
	});
	// 0.00069 for each token created
	const launchFeeAmount = launcherLogs.length * LAUNCH_FEE * 1e18;
	dailyFees.addGasToken(launchFeeAmount);
	dailyProtocolRevenue.addGasToken(launchFeeAmount);

	// 0.3% liquidity
	// Get list pools created by uniderp
	const logs = await getLogs({
		target: poolManager,
		skipIndexer: true,
		fromBlock: configFromBlock,
		eventAbi: poolV4Abi,
	})
	const poolIds = logs.filter((log: any) => log.hooks.toLowerCase() === uniderpHook).map((log: any) => log.id);

	const poolIdSet = new Set(poolIds)

	const blockStep = 1000;
	let i = 0;
	let startBlock = fromBlock;
	let ranges: any = [];

	while (startBlock < toBlock) {
		const endBlock = Math.min(startBlock + blockStep - 1, toBlock)
		ranges.push([startBlock, endBlock]);
		startBlock += blockStep
	}

	let errorFound = false;

	await PromisePool.withConcurrency(5)
		.for(ranges)
		.process(async ([startBlock, endBlock]: any) => {
			if (errorFound) return;
			try {
				const swapLogs = await getLogs({
					target: poolManager,
					skipIndexer: true,
					eventAbi: swapAbi,
					topics: [
						SWAP_TOPIC
					],
					fromBlock: startBlock,
					toBlock: endBlock,
				})

				sdk.log(`Uniderp fees got logs (${swapLogs.length}) for ${i++}/ ${Math.ceil((toBlock - fromBlock) / blockStep)}`)

				for (const log of swapLogs) {
					if (poolIdSet.has(log.id)) {
						const swapVolume = getAbsoluteBigInt(log.amount0);

						// User pays 1% fees on each swap
						const userFeeAmount = swapVolume * 100n / 10000n; // 1%
						dailyFees.addGasToken(userFeeAmount);
					}
				}
			} catch (e) {
				errorFound = e as boolean;
				throw e;
			}
		});

	if (errorFound) throw errorFound;

	const dailyUserFees = dailyFees.clone();
	const dr = dailyFees.clone().resizeBy(0.5);
	dailyProtocolRevenue.addBalances(dr); // 50% of user fees (0.5% of volume)
	const dailySupplySideRevenue = dr.clone().resizeBy(0.3); // 30% of user fees (0.3% of volume)

	return {
		dailyFees,
		dailyRevenue: dailyProtocolRevenue,
		dailyUserFees,
		dailyProtocolRevenue,
		dailySupplySideRevenue
	};
}

const methodology = {
	UserFees: "User pays 1% fees on each swap.",
	Fees: "All fees comes from the user. User pays 1% fees on each swap.",
	Revenue: "Treasury receives 0.5% of each swap. (0.2% from swap + 0.3% from LPs) + Launch Fees (0.00069 ETH for each token created)",
	ProtocolRevenue: "Treasury receives 0.5% of each swap. (0.2% from swap + 0.3% from LPs) + Launch Fees (0.00069 ETH for each token created)"
}

const adapter: SimpleAdapter = {
	version: 1,
	adapter: Object.keys(config).reduce((acc, chain) => {
		const { start } = config[chain];
		acc[chain] = {
			fetch: fetchFees,
			start: start,
			meta: {
				methodology
			}
		};
		return acc;
	}, {}),
};

export default adapter;