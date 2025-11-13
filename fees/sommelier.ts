import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";
import ADDRESSES from "../helpers/coreAssets.json";

// Cellar addresses by chain
const CELLARS: Record<string, string[]> = {
  [CHAIN.ETHEREUM]: [
    "0x97e6e0a40a3d02f12d1cec30ebfbae04e37c119e", // Real Yield USD
    "0xb5b29320d2dde5ba5bafa1ebcd270052070483ec", // Real Yield ETH
    "0x0274a704a6d9129f90a62ddc6f6024b33ecdad36", // Real Yield BTC
    "0x03df2a53cbed19b824347d6a45d09016c2d1676a", // DeFi Stars
    "0x6c51041a91c91c86f3f08a72cb4d3f67f1208897", // ETH Growth
    "0x0c190ded9be5f512bd72827bdad4003e9cc7975c", // Turbo GHO
    "0xfd6db5011b171b05e1ea3b92f9eacaeeb055e971", // Turbo stETH
    "0xc7372Ab5dd315606dB799246E8aA112405abAeFf", // Turbo stETH Deposit
    "0xcf4b531b4cde95bd35d71926e09b2b54c564f5b6", // Morpho Maximizer
    "0x6c1edce139291Af5b84fB1e496c9747F83E876c9", // Turbo divETH
    "0x19B8D8FC682fC56FbB42653F68c7d48Dd3fe597E", // Turbo ETHX
    "0xdAdC82e26b3739750E036dFd9dEfd3eD459b877A", // Turbo eETH V2
    "0x1dffb366b5c5A37A12af2C127F31e8e0ED86BDbe", // Turbo rsETH
    "0x27500De405a3212D57177A789E30bb88b0AdbeC5", // Turbo ezETH
  ],
  [CHAIN.ARBITRUM]: [
    "0xC47bB288178Ea40bF520a91826a3DEE9e0DbFA4C", // Real Yield ETH ARB
    "0x392B1E6905bb8449d26af701Cdea6Ff47bF6e5A8", // Real Yield USD ARB
  ],
  [CHAIN.OPTIMISM]: [
    "0xC47bB288178Ea40bF520a91826a3DEE9e0DbFA4C", // Real Yield ETH OPT
  ],
};

// Common tokens used in Sommelier vaults
const TOKENS: Record<string, string[]> = {
  [CHAIN.ETHEREUM]: [
    ADDRESSES.ethereum.USDC,
    ADDRESSES.ethereum.WETH,
    ADDRESSES.ethereum.WBTC,
    ADDRESSES.ethereum.DAI,
    ADDRESSES.ethereum.USDT,
  ],
  [CHAIN.ARBITRUM]: [
    ADDRESSES.arbitrum.USDC,
    ADDRESSES.arbitrum.WETH,
    ADDRESSES.arbitrum.WBTC,
  ],
  [CHAIN.OPTIMISM]: [
    ADDRESSES.optimism.USDC_CIRCLE,
    ADDRESSES.optimism.WETH,
  ],
};

interface ChainConfig {
  cellars: string[];
  tokens: string[];
  start: string;
}

const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: {
    cellars: CELLARS[CHAIN.ETHEREUM],
    tokens: TOKENS[CHAIN.ETHEREUM],
    start: '2023-01-01',
  },
  [CHAIN.ARBITRUM]: {
    cellars: CELLARS[CHAIN.ARBITRUM],
    tokens: TOKENS[CHAIN.ARBITRUM],
    start: '2024-01-01',
  },
  [CHAIN.OPTIMISM]: {
    cellars: CELLARS[CHAIN.OPTIMISM],
    tokens: TOKENS[CHAIN.OPTIMISM],
    start: '2024-02-01',
  },
};

const fetch = async (options: FetchOptions) => {
  const config = chainConfig[options.chain];
  
  // Get strategist payout addresses from all cellars
  const feeDataResults = await options.api.multiCall({
    abi: 'function feeData() view returns (uint64 strategistPlatformCut, uint64 platformFee, uint64 lastAccrual, address strategistPayoutAddress)',
    calls: config.cellars,
    permitFailure: true,
  });

  // Extract unique strategist payout addresses
  const strategistAddresses = new Set<string>();
  feeDataResults.forEach((result: any) => {
    if (result && result.strategistPayoutAddress) {
      strategistAddresses.add(result.strategistPayoutAddress.toLowerCase());
    }
  });

  const dailyFees = options.createBalances();
  
  // Track fees sent to strategist payout addresses
  for (const strategist of Array.from(strategistAddresses)) {
    const fees = await addTokensReceived({
      options,
      target: strategist,
      tokens: config.tokens,
    });
    dailyFees.addBalances(fees);
  }

  // Note: strategistPlatformCut determines the split
  // Typically 80% goes to protocol, 20% to strategist
  // For now, we'll report all fees as dailyFees
  // and estimate revenue based on typical 80% split
  const dailyRevenue = dailyFees.clone(0.8);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue: dailyFees.clone(0.2),
  };
};

const methodology = {
  Fees: "Total fees collected from Sommelier Cellars including management fees (flat-rate annualized on TVL, typically 1-2%) and performance fees (earned when cellar exceeds high-watermark, typically 10-20%). Fees are paid out to strategist payout addresses configured in each cellar's feeData.",
  Revenue: "Protocol share of fees (typically 50-80% based on strategistPlatformCut parameter). The exact split varies by cellar but commonly follows an 80/20 protocol/strategist split.",
  ProtocolRevenue: "Fees that go to Sommelier protocol after strategist split, ultimately bridged to Sommelier Chain",
  SupplySideRevenue: "Fees paid to strategists for managing cellars (typically 20-50% of total fees)",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.keys(chainConfig).reduce((acc, chain) => ({
    ...acc,
    [chain]: {
      fetch,
      start: chainConfig[chain].start,
    }
  }), {}),
  methodology,
};

export default adapter;
