export const V3_POOL_FACTORY = {
	FEE_SCALE: 1e6,
	event: {
		Swap: "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
		PoolCreated:
			"event PoolCreated(address indexed token0, address indexed token1, int24 indexed tickSpacing, address pool)"
	},
	function: {
		getSwapFee: "function getSwapFee(address) external view override returns (uint24)"
	}
};

export const V3_POOL = {
	event: {
		CollectFees:
			"event CollectFees(address indexed recipient, uint128 amount0, uint128 amount1)"
	},
	function: {
		gaugeFees: "function gaugeFees() view returns (uint128 token0, uint128 token1)"
	}
};

export const V2_POOL_FACTORY = {
	FEE_SCALE: 1e4,
	event: {
		Swap: "event Swap(address indexed sender, address indexed to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out)",
		PoolCreated:
			"event PoolCreated(address indexed token0, address indexed token1, bool indexed stable, address pool, uint256)"
	},
	function: {
		getFee: "function getFee(address, bool) external view returns (uint256)"
	}
};

export const VOTER = {
	function: {
		gauges: "function gauges(address) view returns (address)",
		gaugeToBribe: "function gaugeToBribe(address) external view returns (address)",
		epochStart: "function epochStart(uint256) internal pure returns (uint256)",
		epochNext: "function epochNext(uint256) internal pure returns (uint256)"
	}
};

export const GAUGE = {
	function: {
		rewardToken: "address:rewardToken",
		rewardRateByEpoch: "function rewardRateByEpoch(uint256) external view returns (uint256)"
	}
};

export const BRIBE = {
	event: {
		NotifyReward:
			"event NotifyReward(address indexed from, address indexed reward, uint256 indexed epoch, uint256 amount)"
	}
};
