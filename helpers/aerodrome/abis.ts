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
