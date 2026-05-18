import * as V2Fetchers from "./fetchers/v2";
import type * as AdapterTypes from "../../adapters/types";

interface AerodromeABI {
	POOL_FACTORY: Partial<{
		itemAbi: string;
		lengthAbi: string;
	}>;
}

interface AerodromeExportConfig {
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

		const { volume, fees, supplySideRevenue } = await V2Fetchers.getV2PoolMetrics(
			fetchOptions,
			{ pools }
		);

		return {
			dailyVolume: volume,
			dailyFees: fees,
			dailySupplySideRevenue: supplySideRevenue
		};
	};
};
