// Foci — token launchpad on Arc (chain id 5042). Contracts: https://github.com/yonzaynator/foci
export const FACTORY = "0xa392D6eca5242715517eeCd43406aeD19424FAC0"; // FociLaunchFactory
export const FEE_ESCROW = "0x5a76a44B49ca0f7c4dB181f289C1eCA91d928406"; // FociFeeEscrow
export const MEME_HOOK = "0xF847790B6fA5DA300BB3f56f10d743e71E98e044"; // FociMemeHook (V4 hook)
export const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951"; // Uniswap V4 PoolManager on Arc
export const REWARDS_FACTORY = "0xdac447110867954F00638125bbd5c66D8E0a7195"; // FociRewardsDistributorFactory
// Arc's USDC as the 6-decimal ERC-20 view token; every Foci launch is quoted in it.
export const USDC = "0x3600000000000000000000000000000000000000";
export const FACTORY_START_BLOCK = 20883999; // 2026-09-14
export const REWARDS_FACTORY_START_BLOCK = 21075146; // 2026-09-15
export const START = "2026-09-14";

export const ABI = {
  tokenLaunched:
    "event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)",
  poolRegistered: "event PoolRegistered(bytes32 indexed poolId, address memecoin, address quoteToken, address creator)",
  creditedToken: "event CreditedToken(address indexed recipient, address indexed token, address indexed depositor, uint256 amount)",
  referralFeeClaimed: "event ReferralFeeClaimed(address indexed referrer, address indexed currency, uint256 amount)",
  distributorDeployed:
    "event DistributorDeployed(address indexed token, address indexed distributor, address indexed creator, address pairToken, bytes32 salt)",
  curveBuy: "event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)",
  curveSell: "event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax)",
  swap: "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
  getLaunchFeePolicy:
    "function getLaunchFeePolicy(address token) view returns ((address protocolFeeRecipient, uint16 protocolFeeShareBps, uint16 hookFeeBps, uint16 maxInternalPriceImpactBps, uint16 referralDiscountBps, uint16 referralShareBps))",
};
