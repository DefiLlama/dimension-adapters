import { ethers } from "ethers";
import BigNumber from "bignumber.js";
import * as sdk from "@defillama/sdk";
import PromisePool from "@supercharge/promise-pool";
import type * as HelperTypes from "../types";
import type { FetchOptions } from "../../../adapters/types";
import * as ABI from "../abis";
import { MAX_CONCURRENCY, splitRange } from "../utils";

export const getV3Pools = async (
	fetchOptions: FetchOptions,
	options: HelperTypes.PoolFetcherOptions
): Promise<Record<string, HelperTypes.Pool>> => {
	const { api, getLogs } = fetchOptions;
	const pools: Record<string, HelperTypes.Pool> = {};

	for (const factory of options.factories) {
		const poolCreatedLogs = await getLogs({
			target: factory.address,
			fromBlock: factory.fromBlock,
			eventAbi: ABI.V3_POOL_FACTORY.event.PoolCreated,
			onlyArgs: true,
			skipIndexer: true,
			cacheInCloud: true
		});

		const poolFees = await api.multiCall({
			target: factory.address,
			abi: ABI.V3_POOL_FACTORY.function.getSwapFee,
			calls: poolCreatedLogs.map(({ pool }) => pool)
		});

		poolCreatedLogs.forEach(({ token0, token1, pool }, poolIndex) => {
			const poolAddress = sdk.util.normalizeAddress(pool);
			pools[poolAddress] = {
				poolAddress,
				fee: Number(poolFees[poolIndex]),
				tokens: [sdk.util.normalizeAddress(token0), sdk.util.normalizeAddress(token1)]
			};
		});
	}

	return pools;
};

export const getV3Swaps = async (
	fetchOptions: FetchOptions,
	options: HelperTypes.SwapFetcherOptions
): Promise<HelperTypes.Swap[]> => {
	const swaps: HelperTypes.Swap[] = [];
	if (!options.pools.length) return swaps;

	const { getLogs, getFromBlock, getToBlock } = fetchOptions;
	const swapIface = new ethers.Interface([ABI.V3_POOL_FACTORY.event.Swap]);
	const poolSet = new Set(options.pools);
	await PromisePool.withConcurrency(MAX_CONCURRENCY)
		.handleError((e, _, pool) => {
			pool.stop();
			throw e;
		})
		.for(splitRange(await getFromBlock(), await getToBlock()))
		.process(([fromBlock, toBlock]) =>
			getLogs({
				noTarget: true,
				eventAbi: ABI.V3_POOL_FACTORY.event.Swap,
				parseLog: false,
				entireLog: true,
				skipCache: true,
				fromBlock,
				toBlock
			}).then((logs) => {
				logs.forEach((log) => {
					const poolAddress = sdk.util.normalizeAddress(log.address);
					if (!poolSet.has(poolAddress)) return;

					const [, , amount0, amount1] = swapIface.parseLog(log)?.args ?? [0, 0, 0, 0];

					swaps.push({
						poolAddress,
						amount0: BigNumber(amount0),
						amount1: BigNumber(amount1)
					});
				});
			})
		);

	return swaps;
};

type PoolFeesMap = Record<string, [BigNumber, BigNumber]>;
export interface CollectedFeesFetcherOptions {
	pools: string[];
}

const getV3PoolCollectedFees = async (
	fetchOptions: FetchOptions,
	options: CollectedFeesFetcherOptions
): Promise<PoolFeesMap> => {
	const poolFeesMap: PoolFeesMap = {};
	if (!options.pools.length) return poolFeesMap;

	const collectFeesLogs = await fetchOptions.getLogs({
		noTarget: true,
		eventAbi: ABI.V3_POOL.event.CollectFees,
		entireLog: true
	});

	const poolSet = new Set(options.pools);
	collectFeesLogs.forEach((log) => {
		const poolAddress = sdk.util.normalizeAddress(log.address);
		if (!poolSet.has(poolAddress)) return;

		if (!poolFeesMap[poolAddress]) {
			poolFeesMap[poolAddress] = [BigNumber(0), BigNumber(0)];
		}

		const fees = poolFeesMap[poolAddress];
		fees[0] = fees[0].plus(log.args.amount0);
		fees[1] = fees[1].plus(log.args.amount1);
	});

	return poolFeesMap;
};

export interface VoterSwapFeesShareFetcherOptions {
	pools: Record<string, HelperTypes.Pool>;
}

const getV3VoterSwapFeesShare = async (
	fetchOptions: FetchOptions,
	options: VoterSwapFeesShareFetcherOptions
) => {
	const balance = fetchOptions.createBalances();
	const poolAddresses = Object.keys(options.pools);
	if (!poolAddresses.length) return balance;

	const collectedPoolFeesMap = await getV3PoolCollectedFees(fetchOptions, {
		pools: poolAddresses
	});
	const [gaugeFeesStart, gaugeFeesEnd] = await Promise.all([
		fetchOptions.fromApi.multiCall({
			abi: ABI.V3_POOL.function.gaugeFees,
			calls: poolAddresses
		}),
		fetchOptions.api.multiCall({
			abi: ABI.V3_POOL.function.gaugeFees,
			calls: poolAddresses
		})
	]);

	Object.entries(options.pools).forEach(([pool, { tokens }], poolIndex) => {
		const [token0, token1] = tokens;
		const [gaugeFee0Start, gaugeFee1Start] = gaugeFeesStart[poolIndex] ?? [0, 0];
		const [gaugeFee0End, gaugeFee1End] = gaugeFeesEnd[poolIndex] ?? [0, 0];
		const [collectedFee0, collectedFee1] = collectedPoolFeesMap[pool] ?? [
			BigNumber(0),
			BigNumber(0)
		];

		balance.add(token0, collectedFee0.plus(gaugeFee0End - gaugeFee0Start));
		balance.add(token1, collectedFee1.plus(gaugeFee1End - gaugeFee1Start));
	});

	return balance;
};

export const getV3PoolMetrics = async (
	fetchOptions: FetchOptions,
	options: HelperTypes.PoolMetricsFetcherOptions
) => {
	const volume = fetchOptions.createBalances();
	const fees = fetchOptions.createBalances();
	const voterRevenue = fetchOptions.createBalances();
	const supplySideRevenue = fetchOptions.createBalances();

	const poolAddresses = Object.keys(options.pools);
	if (poolAddresses.length) {
		const swaps = await getV3Swaps(fetchOptions, { pools: poolAddresses });

		const shareOf = (scaledPercent: number, total: BigNumber) =>
			total
				.times(scaledPercent)
				.div(ABI.V3_POOL_FACTORY.FEE_SCALE)
				.integerValue(BigNumber.ROUND_CEIL);

		for (const { poolAddress, amount0, amount1 } of swaps) {
			const pool = options.pools[poolAddress];
			const [token0, token1] = pool.tokens;

			if (amount0.isGreaterThan(0)) {
				volume.add(token0, amount0);
				fees.add(token0, shareOf(pool.fee, amount0));
			} else if (amount1.isGreaterThan(0)) {
				volume.add(token1, amount1);
				fees.add(token1, shareOf(pool.fee, amount1));
			}
		}

		const poolsWithGauge = Object.fromEntries(
			Object.entries(options.pools).filter(([pool]) => !!options.poolGauges[pool])
		);

		const voterSwapFeesShare = await getV3VoterSwapFeesShare(fetchOptions, {
			pools: poolsWithGauge
		});

		voterRevenue.add(voterSwapFeesShare);

		supplySideRevenue.add(fees);
		supplySideRevenue.subtract(voterRevenue);
		supplySideRevenue.removeNegativeBalances();
	}

	return { volume, fees, voterRevenue, supplySideRevenue };
};
