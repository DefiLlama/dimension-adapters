import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// ubi.fun (ubi.fun) - "the first memecoin launchpad where holding pays", on Arc.
// The protocol is an open-source fork of Flaunch (github.com/flayerlabs/flaunchgg-contracts,
// MIT) redeployed for Arc's native USDC: https://ubi.fun/docs/integrate/contracts confirms
// the addresses below, which also match ubi.fun's own subgraph deploy manifest
// (github.com/ubidotfun/subgraph, subgraph.yaml + src/mapping.ts) and Uniswap's public
// hooklist (github.com/Uniswap/hooklist PR #7996, "Add Flaunch PositionManager hook on arc",
// address 0xc780c0f4aac690908854d351b8bfda2812daefdc).
//
// Every trade's swap fee is captured by the PositionManager hook and allocated (accrual,
// not claim) into FeeEscrow against one of two payees: the coin's creator, or a single
// protocol-wide address ("PlatformFeeSplitter", named as such in ubi.fun's own subgraph
// mapping.ts). This is FeeEscrow.Deposit, not the later Withdrawal - Deposit fires once per
// swap when the fee is earned; Withdrawal only fires when a payee manually claims, which is
// sporadic and lags accrual (observed directly: in a 300k-block sample only 2 Withdrawals
// covered fees accrued across 100 Deposits).
const FEE_ESCROW = "0x678f0D1C045e820Ec1d4806749f2629e1035550e";
const REFERRAL_ESCROW = "0xf25B9ceAba005CcCb0cefC4e323e6e519F111eB3";
// The protocol-wide fee payee. Sourced verbatim from ubi.fun's subgraph src/mapping.ts,
// which classifies FeeEscrow withdrawals by exactly this constant ("isProtocol =
// _sender.equals(PLATFORM_FEE_SPLITTER)"). Every other Deposit payee is a coin creator.
const PLATFORM_FEE_SPLITTER = "0x3cb45926ee3b9381931bc96af10d30b630b75a87";
// Arc's native gas token IS USDC (18-decimal native interface at the zero address); this is
// the separate 6-decimal ERC20 facade. Every FeeEscrow/ReferralEscrow amount below was
// verified on real logs to carry this exact address as its `token` field (never the null
// address), so it is tagged as a plain ERC20, never routed through addGasToken/ADDRESSES.null.
const USDC = ADDRESSES.arc.USDC;

const DEPOSIT_EVENT =
  "event Deposit(bytes32 indexed poolId, address payee, address token, uint256 amount)";
const TOKENS_ASSIGNED_EVENT =
  "event TokensAssigned(bytes32 indexed poolId, address indexed user, address indexed token, uint256 amount)";

// PlatformFeeSplitter's own split of the protocol's cut, confirmed exactly on-chain: a real
// withdraw+distribute (tx 0x5679c4a8374bb1c96ff132541cf2995e6ea999bac0881ca031f48024e6e75670,
// FeeEscrow.Withdrawal of 37349169 raw USDC) was immediately followed by two USDC transfers
// out of PlatformFeeSplitter in the same window: 14365065 to a team wallet and 22984104 to
// the URD contract (0x66003091e723778d7D3285BB6c24ff3F0Ddcc7F7, ubi.fun's "daily USDC holder
// pool" distributor per the ubi.fun SDK README). 14365065/37349169 = 15/39 exactly and
// 22984104/37349169 = 24/39 exactly (integer division with zero remainder both ways),
// matching ubi.fun's published split (Team 15%, Holder pool 24%, of the 1.25% swap fee) to
// the whole unit. Reduced to lowest terms: 5/13 team, 8/13 holder pool.
const TEAM_NUM = 5n;
const HOLDER_NUM = 8n;
const SPLITTER_DENOM = TEAM_NUM + HOLDER_NUM; // 13, i.e. 15+24=39 reduced by /3

const CREATOR_FEES = "Creator & Buyback Fees";
const PROTOCOL_FEES = "Protocol Fees";
const REFERRAL_FEES = "Referral Fees";
const TEAM_REVENUE = "Team Revenue";
const HOLDER_POOL_DIVIDENDS = "Holder Pool Dividends";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const deposits = await options.getLogs({ target: FEE_ESCROW, eventAbi: DEPOSIT_EVENT });
  for (const log of deposits) {
    if (String(log.token).toLowerCase() !== USDC.toLowerCase()) continue;
    const amount = BigInt(log.amount);
    if (String(log.payee).toLowerCase() === PLATFORM_FEE_SPLITTER) {
      dailyFees.add(USDC, amount, PROTOCOL_FEES);
      const teamShare = (amount * TEAM_NUM) / SPLITTER_DENOM;
      dailyRevenue.add(USDC, teamShare, TEAM_REVENUE);
      dailySupplySideRevenue.add(USDC, amount - teamShare, HOLDER_POOL_DIVIDENDS);
    } else {
      // The coin creator's own share, inclusive of any floor-support/buyback the launch's
      // fee-allocation policy routes before the creator claims (both are the creator's own
      // funds, not the protocol's, so both are supply side).
      dailyFees.add(USDC, amount, CREATOR_FEES);
      dailySupplySideRevenue.add(USDC, amount, CREATOR_FEES);
    }
  }

  // Referrers earn 5% of the swap fee, paid in the swap's OUTPUT token (ubi.fun SDK README:
  // "buys accrue the coin, sells accrue USDC"). Only the USDC-denominated (sell-side) leg is
  // counted here: the coin-denominated (buy-side) leg would need pricing an arbitrary,
  // frequently illiquid, newly-launched memecoin, which this repo's guidelines reject as
  // unreliable. This slightly understates both Fees and SupplySideRevenue on referred buys.
  const assigned = await options.getLogs({ target: REFERRAL_ESCROW, eventAbi: TOKENS_ASSIGNED_EVENT });
  for (const log of assigned) {
    if (String(log.token).toLowerCase() !== USDC.toLowerCase()) continue;
    const amount = BigInt(log.amount);
    dailyFees.add(USDC, amount, REFERRAL_FEES);
    dailySupplySideRevenue.add(USDC, amount, REFERRAL_FEES);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "The full swap fee captured by ubi.fun's PositionManager hook on every trade, read from FeeEscrow's per-swap fee allocations (creator and protocol legs) plus the USDC-denominated half of referral payouts. Excludes the referral share paid in the launched coin itself on buy trades (not reliably priced).",
  Revenue: "ubi.fun's own take: the team's share of the protocol fee leg (5/13 of it, i.e. 15% of the total swap fee), confirmed on-chain against a real PlatformFeeSplitter distribution.",
  ProtocolRevenue: "Same as Revenue.",
  SupplySideRevenue: "Everything not kept by the ubi.fun team: the coin creator's fee share (including any buyback/floor-support funded from it), the daily USDC holder-pool dividend paid to the launched coin's own holders (8/13 of the protocol fee leg, i.e. 24% of the total swap fee), and the USDC-denominated half of referral payouts.",
};

const breakdownMethodology = {
  Fees: {
    [CREATOR_FEES]: "The coin creator's share of the swap fee, allocated in FeeEscrow.",
    [PROTOCOL_FEES]: "The protocol-wide share of the swap fee, allocated in FeeEscrow to ubi.fun's PlatformFeeSplitter (funds both the team's revenue and the holder-pool dividend).",
    [REFERRAL_FEES]: "The referrer's 5% share of the swap fee, USDC-denominated leg only (sell-side trades).",
  },
  Revenue: {
    [TEAM_REVENUE]: "5/13 (15% of the total swap fee) of the protocol fee leg, kept by the ubi.fun team.",
  },
  ProtocolRevenue: {
    [TEAM_REVENUE]: "5/13 (15% of the total swap fee) of the protocol fee leg, kept by the ubi.fun team.",
  },
  SupplySideRevenue: {
    [CREATOR_FEES]: "The coin creator's share of the swap fee, including any buyback/floor-support funded from it.",
    [HOLDER_POOL_DIVIDENDS]: "8/13 (24% of the total swap fee) of the protocol fee leg, forwarded to the URD contract that pays the launched coin's holders their daily USDC dividend.",
    [REFERRAL_FEES]: "The referrer's 5% share of the swap fee, USDC-denominated leg only (sell-side trades).",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  // First real coin launch on-chain: block 21084053, 2026-09-16T02:10:04Z (tx
  // 0x4ae8fc34afe223f3d3c866cbc610f8e61c7590cca45e84486ca7eb22f60e302c), matching Arc
  // mainnet's own public launch date.
  start: "2026-09-16",
  methodology,
  breakdownMethodology,
};

export default adapter;
