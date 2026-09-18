// ARK Launch (https://ark-ai.xyz): token launchpad on Arc. Each launch seeds a 1% Uniswap V3 USDC pool whose LP
// position is locked in a FeeLocker. The locker's distribute() converts collected pool fees to USDC and emits
// FeesDistributed (75% creator / 25% protocol); creator-configured token taxes emit TaxDistributed (100% creator);
// the 1 USDC creation fee is emitted on TokenLaunched. Two factory/locker generations are live (gen1 own V3 fork,
// gen2 official Uniswap V3 factory). Contracts: https://github.com/yinyuan659-dev/ark
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const USDC = "0x3600000000000000000000000000000000000000"; // Arc native USDC ERC-20 interface, 6 decimals

const FACTORIES = [
  "0x3d0B83e115205EDf37e48A8EB6d92e2C7492A00C", // gen1
  "0x9B9A136d04E8E19a934de062F0FBB929b3C7AEdb", // gen2
];
const LOCKERS = [
  "0x4f260E5E9B475c36eE296E23b1818692408D9F4b", // gen1
  "0x4982E02eF7a31a7a0cdD3a9935f3c856EffA5190", // gen2
];

const TOKEN_LAUNCHED = "event TokenLaunched(address indexed token, address indexed deployer, address indexed pool, uint256 positionId, bool isToken0, uint256 restrictionsEndBlock, uint256 graduationThreshold, uint256 initialBuyUsdc, uint256 creationFeePaid)";
const FEES_DISTRIBUTED = "event FeesDistributed(address indexed token, uint256 quoteToCreator, uint256 quoteToProtocol, uint256 tokenConverted, uint256 usdcFromToken, bool creatorPaid)";
const TAX_DISTRIBUTED = "event TaxDistributed(address indexed token, uint256 tokenConverted, address marketingWallet, uint256 usdcToMarketing, address teamWallet, uint256 usdcToTeam, bool allPaid)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const fees = await options.getLogs({ targets: LOCKERS, eventAbi: FEES_DISTRIBUTED });
  for (const log of fees) {
    dailyFees.add(USDC, log.quoteToCreator, METRIC.SWAP_FEES);
    dailyFees.add(USDC, log.quoteToProtocol, METRIC.SWAP_FEES);
    dailySupplySideRevenue.add(USDC, log.quoteToCreator, "Swap Fees To Creators");
    dailyRevenue.add(USDC, log.quoteToProtocol, "Swap Fees To Protocol");
  }

  const taxes = await options.getLogs({ targets: LOCKERS, eventAbi: TAX_DISTRIBUTED });
  for (const log of taxes) {
    dailyFees.add(USDC, log.usdcToMarketing, "Token Taxes");
    dailyFees.add(USDC, log.usdcToTeam, "Token Taxes");
    dailySupplySideRevenue.add(USDC, log.usdcToMarketing, "Token Taxes To Creators");
    dailySupplySideRevenue.add(USDC, log.usdcToTeam, "Token Taxes To Creators");
  }

  const launches = await options.getLogs({ targets: FACTORIES, eventAbi: TOKEN_LAUNCHED });
  for (const log of launches) {
    dailyFees.add(USDC, log.creationFeePaid, "Token Creation Fees");
    dailyRevenue.add(USDC, log.creationFeePaid, "Token Creation Fees");
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
};

const methodology = {
  Fees: "1% swap fee on every trade of a launched token, creator-set buy/sell taxes on tax tokens, and the 1 USDC fee per token launch.",
  Revenue: "25% of swap fees plus token creation fees, kept by the protocol.",
  ProtocolRevenue: "Same as Revenue; ARK has no token, so nothing goes to holders.",
  SupplySideRevenue: "75% of swap fees plus all token taxes, paid to token creators.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "1% Uniswap V3 pool fee on trades of launched tokens, converted to USDC by the FeeLocker.",
    "Token Taxes": "Buy/sell taxes of creator-configured tax tokens, converted to USDC.",
    "Token Creation Fees": "Flat 1 USDC fee per token launch.",
  },
  Revenue: {
    "Swap Fees To Protocol": "25% of swap fees, sent to the protocol treasury.",
    "Token Creation Fees": "Flat 1 USDC fee per token launch.",
  },
  ProtocolRevenue: {
    "Swap Fees To Protocol": "25% of swap fees, sent to the protocol treasury.",
    "Token Creation Fees": "Flat 1 USDC fee per token launch.",
  },
  SupplySideRevenue: {
    "Swap Fees To Creators": "75% of swap fees, paid to the token creator.",
    "Token Taxes To Creators": "All tax-token proceeds, paid to the creator's marketing and team wallets.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-09-16",
  methodology,
  breakdownMethodology,
};

export default adapter;
