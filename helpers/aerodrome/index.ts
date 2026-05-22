import { METRIC } from "../metrics";
import * as V2Fetchers from "./fetchers/v2";
import * as V3Fetchers from "./fetchers/v3";
import * as CommonFetchers from "./fetchers/common";
import type * as AdapterTypes from "../../adapters/types";
import type * as HelperTypes from "./types";

export enum AERODROME_METRIC {
	SWAP_FEES = METRIC.SWAP_FEES,
	VOTER_FEES = "VOTER_FEES",
	BRIBES_REVENUE = "BRIBES_REVENUE",
	LP_FEES = "LP_FEES",
	LP_GAUGE_REWARDS = "LP Gauge Rewards"
}

interface AerodromeABI {
	VOTER_FACTORY: Partial<{
		bribesItemAbi: string;
	}>;
}

export interface AerodromeFetchingConfig {
	VOTER_ADDRESS: string;
	POOL_FACTORIES: HelperTypes.PoolFactoryParams[];
	ABI?: Partial<AerodromeABI>;
	PRE_LAUNCH_BRIBE_PRICING?: HelperTypes.PreLaunchBribe[];
}

export const fetchAerodromeV2Metrics = (
	config: AerodromeFetchingConfig
): AdapterTypes.Fetch | AdapterTypes.FetchV2 => {
	return async (fetchOptions: AdapterTypes.FetchOptions) => {
		const { api, createBalances } = fetchOptions;
		const protocolName = fetchOptions.metadata?.protocolName ?? "Aerodrome V2 Helper";
		const dailyVolume = createBalances();
		const dailyFees = createBalances();
		const dailyRevenue = createBalances();
		const dailySupplySideRevenue = createBalances();
		const dailyHoldersRevenue = createBalances();
		const tokenIncentives = createBalances();

		try {
			const pools = await V2Fetchers.getV2Pools(fetchOptions, {
				factories: config.POOL_FACTORIES
			});

			api.log(`[${protocolName}] got ${Object.keys(pools).length} pools.`);

			const poolGauges = await CommonFetchers.getPoolGauges(fetchOptions, {
				VOTER_ADDRESS: config.VOTER_ADDRESS,
				pools: Object.keys(pools)
			});

			const gauges = Object.values(poolGauges);
			api.log(`[${protocolName}] got ${gauges.length} gauges.`);

			const { volume, fees, voterRevenue, supplySideRevenue } =
				await V2Fetchers.getV2PoolMetrics(fetchOptions, { pools, poolGauges });

			dailyVolume.add(volume);
			dailyFees.add(fees);
			dailyRevenue.add(voterRevenue);
			dailySupplySideRevenue.add(supplySideRevenue);

			const bribesRevenue = await CommonFetchers.getBribesRevenue(fetchOptions, {
				VOTER_ADDRESS: config.VOTER_ADDRESS,
				itemAbi: config.ABI?.VOTER_FACTORY?.bribesItemAbi,
				preLaunchBribes: config.PRE_LAUNCH_BRIBE_PRICING,
				gauges
			});

			dailyHoldersRevenue.add(voterRevenue, AERODROME_METRIC.VOTER_FEES);
			dailyHoldersRevenue.add(bribesRevenue, AERODROME_METRIC.BRIBES_REVENUE);

			const incentives = await CommonFetchers.getGaugesIncentive(fetchOptions, {
				VOTER_ADDRESS: config.VOTER_ADDRESS,
				gauges
			});

			tokenIncentives.add(incentives);
		} catch (e) {
			api.log(`[${protocolName}] metrics fetch failed`, e);
		}

		return {
			dailyVolume,
			dailyFees,
			dailyRevenue,
			dailySupplySideRevenue,
			dailyHoldersRevenue,
			tokenIncentives
		};
	};
};

export const fetchAerodromeV3Metrics = (
	config: AerodromeFetchingConfig
): AdapterTypes.Fetch | AdapterTypes.FetchV2 => {
	return async (fetchOptions: AdapterTypes.FetchOptions) => {
		const { api, createBalances } = fetchOptions;
		const protocolName = fetchOptions.metadata?.protocolName ?? "Aerodrome V3 Helper";
		const dailyVolume = createBalances();
		const dailyFees = createBalances();
		const dailyRevenue = createBalances();
		const dailySupplySideRevenue = createBalances();
		const dailyHoldersRevenue = createBalances();
		const tokenIncentives = createBalances();

		try {
			const pools = await V3Fetchers.getV3Pools(fetchOptions, {
				factories: config.POOL_FACTORIES
			});

			api.log(`[${protocolName}] got ${Object.keys(pools).length} pools.`);

			const poolGauges = await CommonFetchers.getPoolGauges(fetchOptions, {
				VOTER_ADDRESS: config.VOTER_ADDRESS,
				pools: Object.keys(pools)
			});

			const gauges = Object.values(poolGauges);
			api.log(`[${protocolName}] got ${gauges.length} gauges.`);

			const { volume, fees, voterRevenue, supplySideRevenue } =
				await V3Fetchers.getV3PoolMetrics(fetchOptions, { pools, poolGauges });

			dailyVolume.add(volume);
			dailyFees.add(fees);
			dailyRevenue.add(voterRevenue);
			dailySupplySideRevenue.add(supplySideRevenue);

			const bribesRevenue = await CommonFetchers.getBribesRevenue(fetchOptions, {
				VOTER_ADDRESS: config.VOTER_ADDRESS,
				itemAbi: config.ABI?.VOTER_FACTORY?.bribesItemAbi,
				preLaunchBribes: config.PRE_LAUNCH_BRIBE_PRICING,
				gauges
			});

			dailyHoldersRevenue.add(voterRevenue, AERODROME_METRIC.VOTER_FEES);
			dailyHoldersRevenue.add(bribesRevenue, AERODROME_METRIC.BRIBES_REVENUE);

			const incentives = await CommonFetchers.getGaugesIncentive(fetchOptions, {
				VOTER_ADDRESS: config.VOTER_ADDRESS,
				gauges
			});

			tokenIncentives.add(incentives);
		} catch (e) {
			api.log(`[${protocolName}] metrics fetch failed`, e);
		}

		return {
			dailyVolume,
			dailyFees,
			dailyRevenue,
			dailySupplySideRevenue,
			dailyHoldersRevenue,
			tokenIncentives
		};
	};
};

export interface AerodromeChainConfig {
	fetchParams: AerodromeFetchingConfig;
	start: string;
}

export const aerodromeV2Exports = (
	config: Record<string, AerodromeChainConfig>,
	overrides?: Partial<AdapterTypes.SimpleAdapter>
): AdapterTypes.SimpleAdapter => {
	const exportObject: AdapterTypes.BaseAdapter = {};
	Object.entries(config).map(([chain, chainConfig]) => {
		exportObject[chain] = {
			fetch: fetchAerodromeV2Metrics(chainConfig.fetchParams),
			start: chainConfig.start
		};
	});

	return {
		...overrides,
		version: 2,
		adapter: exportObject
	};
};

export const aerodromeV3Exports = (
	config: Record<string, AerodromeChainConfig>,
	overrides?: Partial<AdapterTypes.SimpleAdapter>
): AdapterTypes.SimpleAdapter => {
	const exportObject: AdapterTypes.BaseAdapter = {};
	Object.entries(config).map(([chain, chainConfig]) => {
		exportObject[chain] = {
			fetch: fetchAerodromeV3Metrics(chainConfig.fetchParams),
			start: chainConfig.start
		};
	});

	return {
		...overrides,
		version: 2,
		adapter: exportObject
	};
};
