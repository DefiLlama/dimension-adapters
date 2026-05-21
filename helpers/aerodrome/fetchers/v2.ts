import { ethers } from "ethers";
import BigNumber from "bignumber.js";
import * as sdk from "@defillama/sdk";
import PromisePool from "@supercharge/promise-pool";
import type * as HelperTypes from "../types";
import type { FetchOptions } from "../../../adapters/types";
import * as ABI from "../abis";
import { getPoolStakedShares } from "./common";
import { addOneToken } from "../../prices";
import { MAX_CONCURRENCY, splitRange } from "../utils";

export const getV2Pools = async (
	fetchOptions: FetchOptions,
	options: HelperTypes.PoolFetcherOptions
): Promise<Record<string, HelperTypes.Pool>> => {
	const { api, getLogs } = fetchOptions;
	const pools: Record<string, HelperTypes.Pool> = {};

	for (const factory of options.factories) {
		const poolCreatedLogs = await getLogs({
			target: factory.address,
			fromBlock: factory.fromBlock,
			eventAbi: ABI.V2_POOL_FACTORY.event.PoolCreated,
			onlyArgs: true,
			skipIndexer: true,
			cacheInCloud: true
		});

		const poolFees = await api.multiCall({
			target: factory.address,
			abi: ABI.V2_POOL_FACTORY.function.getFee,
			calls: poolCreatedLogs.map(({ pool, stable }) => ({
				params: [pool, stable]
			}))
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

export const getV2Swaps = async (
	fetchOptions: FetchOptions,
	options: HelperTypes.SwapFetcherOptions
): Promise<HelperTypes.Swap[]> => {
	const swaps: HelperTypes.Swap[] = [];
	if (!options.pools.length) return swaps;

	const { getLogs, getFromBlock, getToBlock } = fetchOptions;
	const swapIface = new ethers.Interface([ABI.V2_POOL_FACTORY.event.Swap]);
	await PromisePool.withConcurrency(MAX_CONCURRENCY)
		.handleError((e, _, pool) => {
			pool.stop();
			throw e;
		})
		.for(splitRange(await getFromBlock(), await getToBlock()))
		.process(([fromBlock, toBlock]) =>
			getLogs({
				noTarget: true,
				eventAbi: ABI.V2_POOL_FACTORY.event.Swap,
				parseLog: false,
				entireLog: true,
				skipCache: true,
				fromBlock,
				toBlock
			}).then((logs) => {
				logs.forEach((log) => {
					const poolAddress = sdk.util.normalizeAddress(log.address);
					if (!options.pools.includes(poolAddress)) return;

					const [, , amount0In, amount1In, amount0Out, amount1Out] = swapIface.parseLog(
						log
					)?.args ?? [0, 0, 0, 0, 0, 0];

					swaps.push({
						poolAddress,
						amount0: BigNumber(amount0In).plus(amount0Out),
						amount1: BigNumber(amount1In).plus(amount1Out)
					});
				});
			})
		);

	return swaps;
};

export const getV2PoolMetrics = async (
	fetchOptions: FetchOptions,
	options: HelperTypes.PoolMetricsFetcherOptions
) => {
	const volume = fetchOptions.createBalances();
	const fees = fetchOptions.createBalances();
	const voterRevenue = fetchOptions.createBalances();
	const supplySideRevenue = fetchOptions.createBalances();

	const poolAddresses = Object.keys(options.pools);
	if (poolAddresses.length) {
		const swaps = await getV2Swaps(fetchOptions, { pools: poolAddresses });
		const poolStakedShares = await getPoolStakedShares(fetchOptions, {
			poolGauges: options.poolGauges,
			SCALE: ABI.V2_POOL_FACTORY.FEE_SCALE
		});

		const shareOf = (scaledPercent: number, total: BigNumber) =>
			total.times(scaledPercent).div(ABI.V2_POOL_FACTORY.FEE_SCALE).integerValue();

		for (const { poolAddress, amount0, amount1 } of swaps) {
			const pool = options.pools[poolAddress];
			const stakedShare = poolStakedShares[poolAddress] ?? 0;
			const [token0, token1] = pool.tokens;
			const fee0 = shareOf(pool.fee, amount0);
			const fee1 = shareOf(pool.fee, amount1);

			addOneToken({
				chain: fetchOptions.chain,
				balances: volume,
				token0,
				token1,
				amount0,
				amount1
			});
			addOneToken({
				chain: fetchOptions.chain,
				balances: fees,
				token0,
				token1,
				amount0: fee0,
				amount1: fee1
			});

			if (stakedShare > 0) {
				addOneToken({
					chain: fetchOptions.chain,
					balances: voterRevenue,
					token0,
					token1,
					amount0: shareOf(stakedShare, fee0),
					amount1: shareOf(stakedShare, fee1)
				});
			}

			if (stakedShare < ABI.V2_POOL_FACTORY.FEE_SCALE) {
				const supplyShare = ABI.V2_POOL_FACTORY.FEE_SCALE - stakedShare;
				addOneToken({
					chain: fetchOptions.chain,
					balances: supplySideRevenue,
					token0,
					token1,
					amount0: shareOf(supplyShare, fee0),
					amount1: shareOf(supplyShare, fee1)
				});
			}
		}
	}

	return { volume, fees, voterRevenue, supplySideRevenue };
};
