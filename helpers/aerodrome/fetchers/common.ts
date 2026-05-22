import { ethers } from "ethers";
import * as sdk from "@defillama/sdk";
import BigNumber from "bignumber.js";
import type { FetchOptions } from "../../../adapters/types";
import type * as HelperTypes from "../types";
import ADDRESSES from "../../coreAssets.json";
import * as ABI from "../abis";

export interface GaugeFetcherOptions {
	VOTER_ADDRESS: string;
	pools: string[];
}

export const getPoolGauges = async (
	fetchOptions: FetchOptions,
	options: GaugeFetcherOptions
): Promise<Record<string, string>> => {
	if (!options.pools.length) return {};

	const { api } = fetchOptions;
	return api
		.multiCall({
			abi: ABI.VOTER.function.gauges,
			target: options.VOTER_ADDRESS,
			calls: options.pools,
			permitFailure: true
		})
		.then((r) =>
			Object.fromEntries(
				r
					.map((gauge, gaugeIndex) => [
						options.pools[gaugeIndex],
						sdk.util.normalizeAddress(gauge)
					])
					.filter(([, gauge]) => gauge && gauge !== ADDRESSES.null)
			)
		);
};

export interface PoolStakedSharesFetcherOptions {
	poolGauges: Record<string, string>;
	SCALE: number;
}

export const getPoolStakedShares = async (
	fetchOptions: FetchOptions,
	options: PoolStakedSharesFetcherOptions
): Promise<Record<string, number>> => {
	const entriesPoolGauges = Object.entries(options.poolGauges);
	if (!entriesPoolGauges.length) return {};

	const { api } = fetchOptions;
	const [stakedBalances, totalSupplies] = await Promise.all([
		api.multiCall({
			abi: "erc20:balanceOf",
			calls: entriesPoolGauges.map(([pool, gauge]) => ({
				target: pool,
				params: [gauge]
			})),
			permitFailure: true
		}),
		api.multiCall({
			abi: "erc20:totalSupply",
			calls: entriesPoolGauges.map(([pool]) => pool),
			permitFailure: true
		})
	]);

	return Object.fromEntries(
		entriesPoolGauges.map(([pool], i) => {
			const staked = BigNumber(stakedBalances[i] ?? 0);
			const total = BigNumber(totalSupplies[i] ?? 0);
			if (total.isZero()) return [pool, 0];

			return [
				pool,
				Math.min(
					options.SCALE,
					staked.div(total).times(options.SCALE).integerValue().toNumber()
				)
			];
		})
	);
};

export interface BribesRevenueFetcherOptions {
	VOTER_ADDRESS: string;
	gauges: string[];
	preLaunchBribes?: HelperTypes.PreLaunchBribe[];
	itemAbi?: string;
}

export const getBribesRevenue = async (
	fetchOptions: FetchOptions,
	{
		itemAbi = ABI.VOTER.function.gaugeToBribe,
		preLaunchBribes = [],
		...options
	}: BribesRevenueFetcherOptions
) => {
	const balance = fetchOptions.createBalances();
	if (!options.gauges.length) return balance;

	const { api, getLogs, startTimestamp } = fetchOptions;
	const bribes = await api
		.multiCall({
			target: options.VOTER_ADDRESS,
			abi: itemAbi,
			calls: options.gauges
		})
		.then((bribes) => bribes.map(sdk.util.normalizeAddress));

	const notifyRewardsLogs = await getLogs({
		noTarget: true,
		eventAbi: ABI.BRIBE.event.NotifyReward,
		parseLog: false,
		entireLog: true
	});

	const bribeIface = new ethers.Interface([ABI.BRIBE.event.NotifyReward]);
	const bribeSet = new Set(bribes);
	notifyRewardsLogs.forEach((log) => {
		if (!bribeSet.has(sdk.util.normalizeAddress(log.address))) return;

		const [, reward, , amount] = bribeIface.parseLog(log)?.args ?? [0, 0, 0, 0];
		const preLaunchBribe = preLaunchBribes.find(
			({ tokenAddress }) =>
				sdk.util.normalizeAddress(tokenAddress) === sdk.util.normalizeAddress(reward)
		);

		if (preLaunchBribe && startTimestamp < preLaunchBribe.tradingStartedAt) {
			balance.addUSDValue(
				BigNumber(amount)
					.times(preLaunchBribe.priceUsd)
					.div(10 ** preLaunchBribe.decimals)
					.integerValue()
			);
		} else {
			balance.add(reward, amount);
		}
	});

	return balance;
};

export interface EpochFetcherOptions {
	VOTER_ADDRESS: string;
}

export const getEpochs = async (
	fetchOptions: FetchOptions,
	options: EpochFetcherOptions
): Promise<number[]> => {
	const { api, fromTimestamp, toTimestamp } = fetchOptions;
	const epochStart = await api.call({
		target: options.VOTER_ADDRESS,
		abi: ABI.VOTER.function.epochStart,
		params: [fromTimestamp],
		permitFailure: true
	});

	if (!epochStart) return [];

	const epochs: number[] = [Number(epochStart)];
	const MAX_EPOCHS = 520; // ~10 years of weekly epochs
	while (epochs.length < MAX_EPOCHS) {
		const lastFetchedEpoch = epochs[epochs.length - 1];
		const epochNext = Number(
			await api.call({
				target: options.VOTER_ADDRESS,
				abi: ABI.VOTER.function.epochNext,
				params: [lastFetchedEpoch]
			})
		);

		if (!Number.isFinite(epochNext) || epochNext <= lastFetchedEpoch) break;
		if (epochNext >= toTimestamp) break;
		epochs.push(epochNext);
	}

	return epochs;
};

export interface GaugesIncentiveFetcherOptions {
	VOTER_ADDRESS: string;
	gauges: string[];
}

export const getGaugesIncentive = async (
	fetchOptions: FetchOptions,
	options: GaugesIncentiveFetcherOptions
) => {
	const balance = fetchOptions.createBalances();
	if (!options.gauges.length) return balance;

	const { api, fromTimestamp, toTimestamp } = fetchOptions;
	const epochs = await getEpochs(fetchOptions, {
		VOTER_ADDRESS: options.VOTER_ADDRESS
	});

	const epochRates = await api.multiCall({
		abi: ABI.GAUGE.function.rewardRateByEpoch,
		calls: epochs
			.map((epoch) =>
				options.gauges.map((gauge) => ({
					target: gauge,
					params: [epoch]
				}))
			)
			.flat(),
		permitFailure: true
	});

	const rewardTokens = await api.multiCall({
		abi: ABI.GAUGE.function.rewardToken,
		calls: options.gauges,
		permitFailure: true
	});

	const step = options.gauges.length;
	epochRates.forEach((epochRate, i) => {
		const rewardToken = rewardTokens[i % step];
		if (!epochRate || !rewardToken) return;

		const epochIndex = Math.floor(i / step);
		const _fromTs = epochIndex === 0 ? fromTimestamp : epochs[epochIndex];
		const _toTs = epochs[epochIndex + 1] ?? toTimestamp;
		const durationInSeconds = _toTs - _fromTs;

		balance.add(rewardToken, BigNumber(epochRate).times(durationInSeconds));
	});

	return balance;
};
