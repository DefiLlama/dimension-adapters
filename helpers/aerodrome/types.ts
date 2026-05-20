export interface PoolFactoryParams {
	address: string;
	fromBlock: number;
}

export interface PoolFetcherOptions {
	factories: PoolFactoryParams[];
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

export type PreLaunchBribe = {
	tokenAddress: string;
	decimals: number;
	priceUsd: number;
	tradingStartedAt: number;
};
