import { METRIC } from "../metrics";
import * as V2Fetchers from "./fetchers/v2";
import * as CommonFetchers from "./fetchers/common";
import type * as AdapterTypes from "../../adapters/types";

export enum AERODROME_METRIC {
	SWAP_FEES = METRIC.SWAP_FEES,
	VOTER_FEES = "VOTER_FEES",
	BRIBES_REVENUE = "BRIBES_REVENUE",
	LP_FEES = "LP_FEES"
}

interface AerodromeABI {
	POOL_FACTORY: Partial<{
		itemAbi: string;
		lengthAbi: string;
	}>;
	VOTER_FACTORY: Partial<{
		bribesItemAbi: string;
	}>;
}

interface AerodromeExportConfig {
	VOTER_ADDRESS: string;
	POOL_FACTORY_ADDRESS: string;
	ABI?: Partial<AerodromeABI>;
}

export const getAerodromeV2Export = (
	config: AerodromeExportConfig
): AdapterTypes.Fetch | AdapterTypes.FetchV2 => {
	return async (fetchOptions: AdapterTypes.FetchOptions) => {
		const { api } = fetchOptions;
		const protocolName = fetchOptions.metadata?.protocolName ?? "Aerodrome V2 Helper";
		const pools = await V2Fetchers.getV2Pools(fetchOptions, {
			POOL_FACTORY_ADDRESS: config.POOL_FACTORY_ADDRESS,
			itemAbi: config.ABI?.POOL_FACTORY?.itemAbi,
			lengthAbi: config.ABI?.POOL_FACTORY?.lengthAbi
		});

		api.log(`${protocolName} got ${Object.keys(pools).length} pools.`);

		const poolGauges = await CommonFetchers.getPoolGauges(fetchOptions, {
			VOTER_ADDRESS: config.VOTER_ADDRESS,
			pools: Object.keys(pools)
		});

		const gauges = Object.values(poolGauges);
		api.log(`${protocolName} got ${gauges.length} gauges.`);

		const { volume, fees, voterRevenue, supplySideRevenue } = await V2Fetchers.getV2PoolMetrics(
			fetchOptions,
			{ pools, poolGauges }
		);

		const bribesRevenue = await CommonFetchers.getBribesRevenue(fetchOptions, {
			VOTER_ADDRESS: config.VOTER_ADDRESS,
			itemAbi: config.ABI?.VOTER_FACTORY?.bribesItemAbi,
			gauges
		});

		const dailyHoldersRevenue = fetchOptions.createBalances();
		dailyHoldersRevenue.add(voterRevenue, AERODROME_METRIC.VOTER_FEES);
		dailyHoldersRevenue.add(bribesRevenue, AERODROME_METRIC.BRIBES_REVENUE);

		return {
			dailyVolume: volume,
			dailyFees: fees,
			dailyRevenue: voterRevenue,
			dailySupplySideRevenue: supplySideRevenue,
			dailyHoldersRevenue
		};
	};
};
