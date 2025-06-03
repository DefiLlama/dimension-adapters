import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from '@defillama/sdk';
import PromisePool from "@supercharge/promise-pool";

const SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";

const poolV4Abi = 'event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)'
const swapAbi = "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)"

const getAbsoluteBigInt = (value: bigint): bigint => {
	return value < BigInt(0) ? value * BigInt(-1) : value;
};

const config = {
	[CHAIN.UNICHAIN]: {
		poolManager: "0x1f98400000000000000000000000000000000004",
		uniderpHook: "0xb4960cd4f9147f9e37a7aa9005df7156f61e4444",
		start: "2025-04-23",
		fromBlock: 14569072
	},
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
	const { poolManager, uniderpHook, fromBlock: configFromBlock } = config[options.chain]
	const { getToBlock, getFromBlock } = options
	const [toBlock, fromBlock] = await Promise.all([getToBlock(), getFromBlock()])

	const dailyVolume = options.createBalances()

	// Get list pools created by uniderp
	const logs = await options.getLogs({
		target: poolManager,
		eventAbi: poolV4Abi,
		fromBlock: configFromBlock
	})
	const poolIds = logs.filter((log: any) => log.hooks.toLowerCase() === uniderpHook).map((log: any) => log.id);
	console.log(poolIds.length)

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
				const startTime = Date.now();
				const swapLogs = await options.getLogs({
					target: poolManager,
					eventAbi: swapAbi,
					topic: SWAP_TOPIC,
					fromBlock: startBlock,
					toBlock: endBlock,
				})
				const timeElapsed = Date.now() - startTime;
				sdk.log(`Uniderp got logs (${swapLogs.length}) for ${i++}/ ${Math.ceil((toBlock - fromBlock) / blockStep)} in ${timeElapsed}ms`)

				// Filter swap logs for pools created by uniderp
				for (const log of swapLogs) {
					if (poolIdSet.has(log.id)) {
						dailyVolume.addGasToken(getAbsoluteBigInt(log.amount0)); // there are two events for each swap
					}
				}
			} catch (e) {
				errorFound = e as boolean;
				throw e;
			}
		});

	if (errorFound) throw errorFound;

	return {
		dailyVolume
	}
}

const adapter: Adapter = {
	version: 1,
	adapter: Object.keys(config).reduce((acc, chain) => {
		const { start } = config[chain];
		acc[chain] = {
			fetch,
			start: start
		};
		return acc;
	}, {}),
	isExpensiveAdapter: true
}

export default adapter;
