import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// Tolly (tollylabs.com) - no-bonding-curve launchpad on Arc. Each launch mints a
// fixed supply directly into a permanently locked, single-sided Uniswap V3 USDC
// pool (1% tier), trading from block one. Contracts are verified against live
// on-chain bytecode by the team's own repo: github.com/TollyLabs/v3-contracts.
const FEE_LOCKER = "0xe20e4297759597da75c8998ee76ec900600ad920";
const USDC = ADDRESSES.arc.USDC; // matches TollyFeeLocker's own immutable `quote`

const FEES_COLLECTED_EVENT =
  "event FeesCollected(uint256 indexed tokenId, address indexed caller, uint256 amount0, uint256 amount1)";
// token0/token1 for a given position, since Uniswap V3 orders by address and a
// launch can land on either side of USDC.
const POSITIONS_FUNCTION = "function positions(uint256) view returns (address creator, address token0, address token1)";

// TollyFeeLocker._distribute's fixed, no-setter split of the USDC-side fee (read
// from the verified source; also matches KuCoin's independent 2026-09-15 Arc
// launchpad comparison). Creator gets the remainder, not a flat 64%.
const TOLLY_BURN_BPS = 900n; // TollyFurnace buys and burns TOLLY
const PROJECT_BURN_BPS = 500n; // buys and burns the launched project token
const HOLDER_BPS = 1_200n; // TollyHolderVault, per-project
const PROTOCOL_BPS = 1_000n; // TollyTreasury
const BPS = 10_000n;

const TRADING_FEES = "Trading Fees";
const FEES_TO_CREATORS = "Trading Fees to Creators";
const FEES_TO_TOKEN_HOLDERS = "Trading Fees to Launched Token Holders";
const FEES_TO_PROJECT_BUYBACK = "Trading Fees to Project Token Buyback";
const FEES_TO_PROTOCOL = "Trading Fees to Protocol Treasury";
const FEES_TO_TOLLY_BUYBACK = "Trading Fees to TOLLY Buyback";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const collections = await options.getLogs({
    target: FEE_LOCKER,
    eventAbi: FEES_COLLECTED_EVENT,
  });
  if (!collections.length) {
    return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
  }

  const tokenIds = [...new Set(collections.map((log: any) => log.tokenId.toString()))];
  const positions = await options.api.multiCall({ target: FEE_LOCKER, abi: POSITIONS_FUNCTION, calls: tokenIds });
  const token0ById = new Map<string, string>();
  tokenIds.forEach((id, i) => {
    const pos = positions[i];
    if (pos) token0ById.set(id, pos.token0.toLowerCase());
  });

  for (const log of collections) {
    const token0 = token0ById.get(log.tokenId.toString());
    if (!token0) continue;

    const quoteAmount = token0 === USDC.toLowerCase() ? BigInt(log.amount0) : BigInt(log.amount1);
    if (quoteAmount === 0n) continue;

    // The other leg of FeesCollected (project-token-denominated, 100% burned) is real
    // but priced in a just-launched token with no reliable USD price, so it's excluded.
    dailyFees.add(USDC, quoteAmount, TRADING_FEES);

    const tollyBurn = (quoteAmount * TOLLY_BURN_BPS) / BPS;
    const projectBurn = (quoteAmount * PROJECT_BURN_BPS) / BPS;
    const holderShare = (quoteAmount * HOLDER_BPS) / BPS;
    const protocolShare = (quoteAmount * PROTOCOL_BPS) / BPS;
    const creatorShare = quoteAmount - tollyBurn - projectBurn - holderShare - protocolShare;

    // Creator and launched-token holder rewards: non-governance, external-party payouts.
    dailySupplySideRevenue.add(USDC, creatorShare, FEES_TO_CREATORS);
    dailySupplySideRevenue.add(USDC, holderShare, FEES_TO_TOKEN_HOLDERS);
    // Buyback of the launched token itself (not TOLLY) is supply side, not holders revenue.
    dailySupplySideRevenue.add(USDC, projectBurn, FEES_TO_PROJECT_BUYBACK);

    dailyRevenue.add(USDC, protocolShare, FEES_TO_PROTOCOL);
    dailyProtocolRevenue.add(USDC, protocolShare, FEES_TO_PROTOCOL);
    // TOLLY buyback: burns the protocol's own token, so it's revenue reclassified to holders.
    dailyRevenue.add(USDC, tollyBurn, FEES_TO_TOLLY_BUYBACK);
    dailyHoldersRevenue.add(USDC, tollyBurn, FEES_TO_TOLLY_BUYBACK);
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "USDC-side Uniswap V3 swap fees accrued on Tolly's locked launch pools. Excludes the project-token-side fee leg, which is burned outright but has no reliable USD price.",
  Revenue: "The 10% protocol-treasury share plus the 9% spent buying and burning TOLLY.",
  ProtocolRevenue: "The 10% share paid to the treasury.",
  HoldersRevenue: "The 9% share market-bought back into TOLLY and burned.",
  SupplySideRevenue: "The 64% creator share, the 12% launched-token holder-reward share, and the 5% that buys and burns the launched token itself.",
};

const breakdownMethodology = {
  Fees: {
    [TRADING_FEES]: "USDC-denominated Uniswap V3 swap fees accrued on a Tolly launch pool.",
  },
  Revenue: {
    [FEES_TO_PROTOCOL]: "10% of collected fees, paid to the treasury.",
    [FEES_TO_TOLLY_BUYBACK]: "9% of collected fees, spent buying and burning TOLLY.",
  },
  ProtocolRevenue: {
    [FEES_TO_PROTOCOL]: "10% of collected fees, paid to the treasury.",
  },
  HoldersRevenue: {
    [FEES_TO_TOLLY_BUYBACK]: "9% of collected fees, market-bought back into TOLLY and burned.",
  },
  SupplySideRevenue: {
    [FEES_TO_CREATORS]: "64% (the remainder) of collected fees, paid to the token's creator.",
    [FEES_TO_TOKEN_HOLDERS]: "12% of collected fees, booked to the launched token's holder-reward vault.",
    [FEES_TO_PROJECT_BUYBACK]: "5% of collected fees, spent buying back and burning the launched token.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  // TollyPad was live and collecting fees before Arc's 2026-09-16 public mainnet
  // launch (deploy block 13570649, confirmed on-chain). Start is the day after.
  start: "2026-08-03",
  methodology,
  breakdownMethodology,
};

export default adapter;
