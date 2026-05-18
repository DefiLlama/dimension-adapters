import { ethers } from "ethers";
import * as sdk from "@defillama/sdk";
import BigNumber from "bignumber.js";
import type { FetchOptions } from "../../../adapters/types";
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
			permitFailure: true,
			excludeFailed: true
		})
		.then((r) =>
			Object.fromEntries(
				r
					.map((gauge, gaugeIndex) => [
						options.pools[gaugeIndex],
						sdk.util.normalizeAddress(gauge)
					])
					.filter(([, gauge]) => gauge !== ADDRESSES.null)
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
		entriesPoolGauges.map(([pool], i) => [
			pool,
			Math.min(
				options.SCALE,
				BigNumber(stakedBalances[i] ?? 0)
					.div(totalSupplies[i] ?? 0)
					.times(options.SCALE)
					.integerValue()
					.toNumber()
			)
		])
	);
};

export interface BribesRevenueFetcherOptions {
	VOTER_ADDRESS: string;
	gauges: string[];
	itemAbi?: string;
}

export const getBribesRevenue = async (
	fetchOptions: FetchOptions,
	{ itemAbi = ABI.VOTER.function.gaugeToBribe, ...options }: BribesRevenueFetcherOptions
) => {
	const balance = fetchOptions.createBalances();
	if (!options.gauges.length) return balance;

	const { api, getLogs } = fetchOptions;
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
	notifyRewardsLogs.forEach((log) => {
		if (!bribes.includes(sdk.util.normalizeAddress(log.address))) return;
		const [, reward, , amount] = bribeIface.parseLog(log)?.args ?? [0, 0, 0, 0];

		balance.add(reward, amount);
	});

	return balance;
};
