import { ethers } from "ethers";
import BigNumber from "bignumber.js";
import * as sdk from "@defillama/sdk";
import type * as HelperTypes from "../types";
import type { FetchOptions } from "../../../adapters/types";
import * as ABI from "../abis";
import ADDRESSES from "../../coreAssets.json";
import { addOneToken } from "../../prices";

export const getV2Pools = async (
	fetchOptions: FetchOptions,
	{
		itemAbi = ABI.POOL_FACTORY.function.allPairs,
		lengthAbi = ABI.POOL_FACTORY.function.allPairsLength,
		...options
	}: HelperTypes.PoolFetcherOptions
): Promise<Record<string, HelperTypes.Pool>> => {
	const { api } = fetchOptions;
	const pools: string[] = await api.fetchList({
		target: options.POOL_FACTORY_ADDRESS,
		lengthAbi,
		itemAbi
	});

	const filteredPools = pools.filter((pool) => pool !== ADDRESSES.null);

	const [tokens0, tokens1] = await Promise.all([
		api.multiCall({ abi: "address:token0", calls: filteredPools }),
		api.multiCall({ abi: "address:token1", calls: filteredPools })
	]);

	const poolStables = await api.multiCall({ abi: "bool:stable", calls: filteredPools });
	const poolFees = await api.multiCall({
		target: options.POOL_FACTORY_ADDRESS,
		abi: ABI.V2_POOL_FACTORY.function.getFee,
		calls: filteredPools.map((pool, poolIndex) => ({
			params: [pool, poolStables[poolIndex]]
		}))
	});

	return Object.fromEntries(
		filteredPools.map((poolAddress: string, poolIndex: number) => [
			sdk.util.normalizeAddress(poolAddress),
			{
				poolAddress: sdk.util.normalizeAddress(poolAddress),
				fee: Number(poolFees[poolIndex]),
				tokens: [
					sdk.util.normalizeAddress(tokens0[poolIndex]),
					sdk.util.normalizeAddress(tokens1[poolIndex])
				]
			}
		])
	);
};

export const getV2Swaps = async (
	fetchOptions: FetchOptions,
	options: HelperTypes.SwapFetcherOptions
) => {
	if (!options.pools.length) return [];

	const { getLogs } = fetchOptions;
	const swapLogs = await getLogs({
		noTarget: true,
		eventAbi: ABI.V2_POOL_FACTORY.event.Swap,
		parseLog: false,
		entireLog: true,
		skipCache: true
	});

	const swapIface = new ethers.Interface([ABI.V2_POOL_FACTORY.event.Swap]);
	return swapLogs
		.map((log) => {
			const poolAddress = sdk.util.normalizeAddress(log.address);
			if (!options.pools.includes(poolAddress)) return null;

			const [, , amount0In, amount1In, amount0Out, amount1Out] = swapIface.parseLog(log)
				?.args ?? [0, 0, 0, 0, 0, 0];

			return {
				poolAddress,
				amount0: BigNumber(amount0In).plus(amount0Out),
				amount1: BigNumber(amount1In).plus(amount1Out)
			};
		})
		.filter((log) => !!log);
};

export const getV2PoolMetrics = async (
	fetchOptions: FetchOptions,
	options: HelperTypes.PoolMetricsFetcherOptions
) => {
	const volume = fetchOptions.createBalances();
	const fees = fetchOptions.createBalances();
	const supplySideRevenue = fetchOptions.createBalances();

	const poolAddresses = Object.keys(options.pools);
	if (poolAddresses.length) {
		const swaps = await getV2Swaps(fetchOptions, { pools: Object.keys(options.pools) });

		const shareOf = (scaledPercent: number, total: BigNumber) =>
			total.times(scaledPercent).div(ABI.V2_POOL_FACTORY.FEE_SCALE);

		for (const { poolAddress, amount0, amount1 } of swaps) {
			const pool = options.pools[poolAddress];
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

			addOneToken({
				chain: fetchOptions.chain,
				balances: supplySideRevenue,
				token0,
				token1,
				amount0: fee0,
				amount1: fee1
			});
		}
	}

	return { volume, fees, supplySideRevenue };
};
