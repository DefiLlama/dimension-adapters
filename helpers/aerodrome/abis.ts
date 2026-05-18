export const POOL_FACTORY = {
	function: {
		allPairsLength: "uint256:allPoolsLength",
		allPairs: "function allPools(uint256) view returns (address)"
	}
};

export const V2_POOL_FACTORY = {
	FEE_SCALE: 1e4,
	event: {
		Swap: "event Swap(address indexed sender, address indexed to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out)"
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
