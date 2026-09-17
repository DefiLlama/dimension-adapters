import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// Tolly (tollylabs.com) - no-bonding-curve launchpad on Arc. "Launch a token on
// Arc, earn from every trade." Contracts are open-source and verified against
// live on-chain bytecode by the team's own reproducible-verification repo:
// https://github.com/TollyLabs/v3-contracts (deployment/arc-mainnet-5042.json
// pins each address to a source file + creation tx). All figures below are
// read straight from that verified source, not guessed from docs or a blog.
//
// Mechanism (contracts/launchpad/TollyPad.sol): each launch mints a fixed 1B
// supply directly into a brand-new, permanently locked, single-sided Uniswap
// V3 USDC pool (1% fee tier) - no bonding curve, no graduation, trading from
// block one. The LP NFT goes straight to TollyFeeLocker, which can never move
// the principal (no transfer function, no decreaseLiquidity path); only
// accrued swap fees are collectable, and collection is permissionless.
const FEE_LOCKER = "0xe20e4297759597da75c8998ee76ec900600ad920";
const USDC = ADDRESSES.arc.USDC; // 0x3600...0000, Arc's 6-decimal USDC facade; matches TollyFeeLocker's own immutable `quote`.

const FEES_COLLECTED_EVENT =
  "event FeesCollected(uint256 indexed tokenId, address indexed caller, uint256 amount0, uint256 amount1)";
// Public mapping getter on TollyFeeLocker: positions(tokenId) => (creator, token0, token1).
// Needed to know which of amount0/amount1 in FeesCollected is the USDC leg, since Uniswap
// V3 orders token0/token1 by address and a launch can land on either side of USDC.
const POSITIONS_FUNCTION = "function positions(uint256) view returns (address creator, address token0, address token1)";

// TollyFeeLocker._distribute's five-way split of the USDC-side fee (contracts/launchpad/
// TollyFeeLocker.sol lines 82-92, all `constant`, no owner, no setter - verified straight
// from the source pinned in the team's own bytecode-verification manifest). This exact
// 64/12/10/9/5 split also matches the independent description in KuCoin's 2026-09-15 Arc
// launchpad comparison ("64% creators, 12% holder rewards, 10% protocol, 9% TOLLY removal,
// 5% project-token removal"), an external source with no visibility into this repo.
const TOLLY_BURN_BPS = 900n; // 9%  -> Furnace buys and burns TOLLY (the protocol's own token)
const PROJECT_BURN_BPS = 500n; // 5%  -> buys and burns the launched project token
const HOLDER_BPS = 1_200n; // 12% -> TollyHolderVault, booked per-project for the launched token's own holders
const PROTOCOL_BPS = 1_000n; // 10% -> TollyTreasury
// Creator gets the remainder (not a flat 64%), so integer-division dust lands on the
// creator, exactly mirroring `_distribute`'s `amount - tollyBurn - toBurn - toHolders - toProtocol`.
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
    if (!token0) continue; // unregistered/unknown position; should not happen post-register()

    // Pick out whichever side of the pair is USDC - Uniswap V3 orders token0/token1 by
    // address, so a launch can land on either side depending on the token's own address.
    const quoteAmount = token0 === USDC.toLowerCase() ? BigInt(log.amount0) : BigInt(log.amount1);
    if (quoteAmount === 0n) continue;

    // Not modeled: the OTHER leg of FeesCollected (the project-token-denominated fee,
    // accrued when traders sell into the pool) is real - TollyFeeLocker._distribute burns
    // 100% of it outright (TokenFeesBurned) rather than splitting it - but it is
    // denominated in whatever arbitrary token was just launched, most of which have no
    // reliable USD price this soon after a permissionless, single-sided launch. Including
    // it would mix real fees with price-feed noise from thin/manipulable pools. Same
    // conservative omission sashimi/radardex make for their own unmodeled legs.
    dailyFees.add(USDC, quoteAmount, TRADING_FEES);

    const tollyBurn = (quoteAmount * TOLLY_BURN_BPS) / BPS;
    const projectBurn = (quoteAmount * PROJECT_BURN_BPS) / BPS;
    const holderShare = (quoteAmount * HOLDER_BPS) / BPS;
    const protocolShare = (quoteAmount * PROTOCOL_BPS) / BPS;
    const creatorShare = quoteAmount - tollyBurn - projectBurn - holderShare - protocolShare;

    // Creator (64%) and launched-token holder rewards (12%): both are non-governance,
    // external-party payouts - cost of funds, not protocol take.
    dailySupplySideRevenue.add(USDC, creatorShare, FEES_TO_CREATORS);
    dailySupplySideRevenue.add(USDC, holderShare, FEES_TO_TOKEN_HOLDERS);
    // Project-token buyback (5%): a buyback/burn of the LAUNCHED token, not TOLLY itself -
    // per this repo's convention, buybacks of non-governance launched tokens are supply
    // side, never holders revenue, regardless of whether the locker could route it to a
    // live burner (ProjectBurnRouted) or has to park it as the creator's claimable balance
    // for a not-yet-created burner (ProjectBurnUnrouted); either way it is not the
    // protocol's own money to keep.
    dailySupplySideRevenue.add(USDC, projectBurn, FEES_TO_PROJECT_BUYBACK);

    // Protocol treasury (10%): straight profit, no destination other than TollyTreasury,
    // fixed at locker initialization with no setter.
    dailyRevenue.add(USDC, protocolShare, FEES_TO_PROTOCOL);
    dailyProtocolRevenue.add(USDC, protocolShare, FEES_TO_PROTOCOL);
    // TOLLY buyback (9%): a market buy-and-burn of the protocol's OWN token (TOLLY),
    // funded by real fee receipts through TollyFurnace - this is Revenue that is
    // immediately reclassified to holders, not a cost of funds paid to an external party.
    dailyRevenue.add(USDC, tollyBurn, FEES_TO_TOLLY_BUYBACK);
    dailyHoldersRevenue.add(USDC, tollyBurn, FEES_TO_TOLLY_BUYBACK);
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "USDC-side Uniswap V3 swap fees accrued on Tolly's permanently locked, single-sided launch pools, read from each TollyFeeLocker.collect() call's FeesCollected event. Excludes the project-token-side leg of the same event (fees accrued when traders sell into the pool), which TollyFeeLocker burns outright but which is denominated in newly launched tokens with no reliable USD price.",
  Revenue: "The 10% protocol-treasury share plus the 9% share spent buying and burning TOLLY, both read directly from TollyFeeLocker's fixed, non-adjustable bps split.",
  ProtocolRevenue: "The 10% share paid to TollyTreasury.",
  HoldersRevenue: "The 9% share routed to TollyFurnace, which permissionlessly market-buys and burns TOLLY, the protocol's own token.",
  SupplySideRevenue: "The 64% creator share (paid directly or parked as a pull-payment claim), the 12% share booked to the launched token's own holder-reward vault, and the 5% share that buys and burns the launched project token itself (not TOLLY).",
};

const breakdownMethodology = {
  Fees: {
    [TRADING_FEES]: "USDC-denominated Uniswap V3 swap fees accrued on a Tolly launch pool, collected via TollyFeeLocker.collect().",
  },
  Revenue: {
    [FEES_TO_PROTOCOL]: "10% of collected USDC fees, paid to TollyTreasury.",
    [FEES_TO_TOLLY_BUYBACK]: "9% of collected USDC fees, spent by TollyFurnace buying and burning TOLLY.",
  },
  ProtocolRevenue: {
    [FEES_TO_PROTOCOL]: "10% of collected USDC fees, paid to TollyTreasury.",
  },
  HoldersRevenue: {
    [FEES_TO_TOLLY_BUYBACK]: "9% of collected USDC fees, market-bought back into TOLLY and burned.",
  },
  SupplySideRevenue: {
    [FEES_TO_CREATORS]: "64% (the remainder after the other four shares) of collected USDC fees, paid to the token's creator.",
    [FEES_TO_TOKEN_HOLDERS]: "12% of collected USDC fees, booked to the launched token's own TollyHolderVault reward reserve.",
    [FEES_TO_PROJECT_BUYBACK]: "5% of collected USDC fees, spent buying back and burning the launched project token (not TOLLY).",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  // TollyPad was deployed and already collecting real trading fees well before Arc's
  // 2026-09-16 public mainnet launch: its creation tx
  // (0x1183fd2a8633ccab28805c11a95f9b7ffa78107d6a565d6bb1a33c9def87b509, block 13570649)
  // landed in a block timestamped 2026-08-02T22:44:50Z, and its very first launch
  // (TOLLY's own token, launched as token #0 in the same window) was live within
  // minutes of deployment - confirmed live on-chain, not inferred from docs. Matches
  // KuCoin's characterization of Tolly as one of the earliest Arc launchpads, active
  // pre public-mainnet. Start is the first full UTC day after that deploy block.
  start: "2026-08-03",
  methodology,
  breakdownMethodology,
};

export default adapter;
