// ARK Launch (https://ark-ai.xyz) — token launchpad on Arc (Circle's USDC-gas L1).
//
// Every launch seeds a Uniswap V3 1% USDC pool and locks the LP NFT in the FeeLocker forever. The locker's
// permissionless `distribute()` (run by a keeper) collects the pool fees, sells the token side into USDC and pays out:
//   75% → the token creator (paid directly), 25% → the protocol Treasury (settled weekly 76/20/4 to the reserve
//   multisig / buyback multisig / dev wallet). Creators may launch "tax tokens" (≤10% buy / sell tax): the tax is sold
//   into USDC inside the same call and paid to the creator's marketing / team wallets — the protocol keeps none of it.
//   A flat 1 USDC creation fee per launch goes straight to the reserve multisig.
//
//   dailyFees              = pool fees (creator + protocol) + tax proceeds + creation fees
//   dailySupplySideRevenue = creator share of pool fees + tax proceeds
//   dailyRevenue           = protocol share of pool fees + creation fees
//   dailyProtocolRevenue   = dailyRevenue (no token, no holder distribution)
// All amounts are USDC as emitted by the FeeLocker / LaunchFactory events; two factory generations are live.
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const USDC = "0x3600000000000000000000000000000000000000"; // Arc native USDC ERC-20 interface, 6 decimals

const FACTORIES = [
  "0x3d0B83e115205EDf37e48A8EB6d92e2C7492A00C", // gen1 (2026-09-16, own V3 deployment)
  "0x9B9A136d04E8E19a934de062F0FBB929b3C7AEdb", // gen2 (2026-09-16, official Uniswap V3 factory)
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
    dailySupplySideRevenue.add(USDC, log.quoteToCreator, METRIC.SWAP_FEES);
    dailyRevenue.add(USDC, log.quoteToProtocol, METRIC.SWAP_FEES);
  }

  const taxes = await options.getLogs({ targets: LOCKERS, eventAbi: TAX_DISTRIBUTED });
  for (const log of taxes) {
    dailyFees.add(USDC, log.usdcToMarketing, METRIC.CREATOR_FEES);
    dailyFees.add(USDC, log.usdcToTeam, METRIC.CREATOR_FEES);
    dailySupplySideRevenue.add(USDC, log.usdcToMarketing, METRIC.CREATOR_FEES);
    dailySupplySideRevenue.add(USDC, log.usdcToTeam, METRIC.CREATOR_FEES);
  }

  const launches = await options.getLogs({ targets: FACTORIES, eventAbi: TOKEN_LAUNCHED });
  for (const log of launches) {
    dailyFees.add(USDC, log.creationFeePaid, METRIC.SERVICE_FEES);
    dailyRevenue.add(USDC, log.creationFeePaid, METRIC.SERVICE_FEES);
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-09-16",
  methodology: {
    Fees: "1% Uniswap V3 pool fee on every trade of a launched token (collected and converted to USDC by the FeeLocker), creator-set buy/sell taxes on tax tokens, and the 1 USDC creation fee per launch.",
    Revenue: "The protocol's 25% share of pool fees plus creation fees.",
    ProtocolRevenue: "Same as Revenue: 76% to the reserve multisig, 20% to the buyback multisig, 4% to the dev wallet, settled weekly by the Treasury contract.",
    SupplySideRevenue: "The token creators' 75% share of pool fees plus all tax-token proceeds (paid to the creators' marketing / team wallets).",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: "1% Uniswap V3 pool fees on launched tokens, split 75% creator / 25% protocol.",
      [METRIC.CREATOR_FEES]: "Buy / sell taxes of creator-configured tax tokens, 100% to the creator's wallets.",
      [METRIC.SERVICE_FEES]: "Flat 1 USDC creation fee per launch.",
    },
  },
};

export default adapter;
