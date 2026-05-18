export interface PoolFetcherOptions {
	POOL_FACTORY_ADDRESS: string;
	itemAbi?: string;
	lengthAbi?: string;
}

export interface SwapFetcherOptions {
	pools: string[];
}

export interface PoolMetricsFetcherOptions {
	pools: Record<string, Pool>;
	poolGauges: Record<string, string>;
}

export interface Pool {
	poolAddress: string;
	tokens: string[];
	fee: number;
}
