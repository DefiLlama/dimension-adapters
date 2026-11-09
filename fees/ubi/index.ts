import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// ubi.fun - "the first memecoin launchpad where holding pays", on Arc. An open-source
// fork of Flaunch (github.com/flayerlabs/flaunchgg-contracts), confirmed via ubi.fun's
// own subgraph manifest and Uniswap's public hooklist (PR #7996, exact address match).
//
// The PositionManager hook allocates each trade's fee into FeeEscrow, against either
// the coin's creator or a protocol-wide splitter address. Read from Deposit (fires per
// swap at accrual), not Withdrawal (a sporadic manual claim, observed lagging far
// behind accrual).
const FEE_ESCROW = "0x678f0D1C045e820Ec1d4806749f2629e1035550e";
const REFERRAL_ESCROW = "0xf25B9ceAba005CcCb0cefC4e323e6e519F111eB3";
// Protocol-wide fee payee, per ubi.fun's own subgraph mapping code. Every other
// Deposit payee is a coin creator.
const PLATFORM_FEE_SPLITTER = "0x3cb45926ee3b9381931bc96af10d30b630b75a87";
const USDC = ADDRESSES.arc.USDC;

const DEPOSIT_EVENT =
  "event Deposit(bytes32 indexed poolId, address payee, address token, uint256 amount)";
const TOKENS_ASSIGNED_EVENT =
  "event TokensAssigned(bytes32 indexed poolId, address indexed user, address indexed token, uint256 amount)";

// PlatformFeeSplitter's split of the protocol's cut, confirmed on a real withdraw+
// distribute transaction: the two resulting USDC transfers divide the withdrawn total
// by exactly 5/13 (team) and 8/13 (holder pool), matching ubi.fun's published 15%/24%
// split of the total swap fee with zero remainder.
const TEAM_NUM = 5n;
const HOLDER_NUM = 8n;
const SPLITTER_DENOM = TEAM_NUM + HOLDER_NUM;

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
      // Creator's own share, including any floor-support/buyback - still their funds.
      dailyFees.add(USDC, amount, CREATOR_FEES);
      dailySupplySideRevenue.add(USDC, amount, CREATOR_FEES);
    }
  }

  // Referral fee's coin-denominated leg (buy-side) is excluded: no reliable price for
  // an arbitrary freshly-launched memecoin. Only the USDC-denominated (sell-side) leg
  // is counted, understating Fees/SupplySideRevenue slightly on referred buys.
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
  Fees: "The full swap fee on every ubi.fun trade: the creator and protocol legs from FeeEscrow, plus the USDC-denominated half of referral payouts.",
  Revenue: "The team's 15% share of the total swap fee, confirmed on-chain against a real PlatformFeeSplitter distribution.",
  ProtocolRevenue: "Same as Revenue.",
  SupplySideRevenue: "The creator's fee share, the 24% daily USDC holder-pool dividend, and the USDC-denominated half of referral payouts.",
};

const breakdownMethodology = {
  Fees: {
    [CREATOR_FEES]: "The coin creator's share of the swap fee.",
    [PROTOCOL_FEES]: "The protocol-wide share of the swap fee, funding both the team's revenue and the holder-pool dividend.",
    [REFERRAL_FEES]: "The referrer's share of the swap fee, USDC-denominated leg only.",
  },
  Revenue: {
    [TEAM_REVENUE]: "15% of the total swap fee, kept by the ubi.fun team.",
  },
  ProtocolRevenue: {
    [TEAM_REVENUE]: "15% of the total swap fee, kept by the ubi.fun team.",
  },
  SupplySideRevenue: {
    [CREATOR_FEES]: "The coin creator's share of the swap fee, including any buyback/floor-support funded from it.",
    [HOLDER_POOL_DIVIDENDS]: "24% of the total swap fee, paid to the launched coin's holders as a daily USDC dividend.",
    [REFERRAL_FEES]: "The referrer's share of the swap fee, USDC-denominated leg only.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-09-16", // first real coin launch, confirmed on-chain
  methodology,
  breakdownMethodology,
};

export default adapter;
