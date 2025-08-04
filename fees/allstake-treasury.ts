import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

// AllStake unified treasury address that collects fees from all product lines
const TREASURY_ADDRESS = "0xeefd2f0750dd05bfc8dc7caccd918999bdcb25eb";

// Additional fee collection addresses for specific products
const ADDITIONAL_FEE_COLLECTORS = [
  "0x9D740a3300E68aebB18C01aa5AF8Ad5887d9EcCd", // Hell Market Treasury
  "0xb35905301a99271d210d7ddc9cA0060723f79a3b", // Oodle Stake Royalty
  "0xf161d1ce634Aac9d16BaDb887756B07ad43FA0CC", // Sousou Royalty
  "0x34E207F04bEfaa4Ef6dcf604Bb9aA74a9b234957", // Monarchy Treasury
  "0x2315c57b8bf05501a194678e835368898BC34448", // Angelus Treasury
];

// All treasury addresses to track
const ALL_TREASURY_ADDRESSES = [
  TREASURY_ADDRESS,
  ...ADDITIONAL_FEE_COLLECTORS,
];

// Tokens commonly used in AllStake ecosystem
const TRACKED_TOKENS = [
  "0x0000000000000000000000000000000000000000", // Native token (CRO/MATIC)
]

const fetch = async (options: FetchOptions) => {
  // Track all token transfers received by AllStake treasury addresses
  const dailyFees = await addTokensReceived({
    options,
    tokens: TRACKED_TOKENS,
    targets: ALL_TREASURY_ADDRESSES,
  });

  // AllStake retains all treasury inflows as protocol revenue
  // Revenue streams include:
  // 1. NFT staking fees (% of rewards)
  // 3. Raffle entry fees/house edge
  // 4. NFT launch/mint fees
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "All tokens received by AllStake treasury addresses from: NFT staking reward fees, marketplace trading fees, raffle entry fees, and NFT launch fees across all collections (Hell Stake, Oodle Stake, Sousou, Monarchy, NEKO, Kitty, Plush, etc.)",
  Revenue: "All treasury inflows are considered protocol revenue as AllStake operates the entire ecosystem.",
  ProtocolRevenue: "AllStake retains all collected fees for protocol development, operations, and ecosystem growth across Cronos and Polygon networks.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.CRONOS, CHAIN.POLYGON], // Primary chains for AllStake
  start: '2024-01-01', // Adjust based on actual launch date
  methodology
};

export default adapter; 