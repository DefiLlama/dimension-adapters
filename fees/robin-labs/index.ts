import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

/*
 * Robin Labs — a bonding-curve launchpad on Robinhood Chain (robinlab.io).
 *
 * Every trade goes through PadRouter, which emits Bought/Sold for the volume and one FeeSplit carrying the
 * fee ALREADY broken into its destinations. Nothing below re-derives a rate or infers a split — it reports the
 * exact wei that moved, so a per-coin fee change (creators pick 1%-4% per side) needs no adapter change.
 *
 *   FeeSplit(token, platform, deferred, platformCut, dev, floor, burn)
 *
 * `floor` is counted as SUPPLY SIDE, not revenue: it is minted into that coin's permanent buy wall. The
 * protocol has no withdraw path to it, so it is liquidity provided to the coin rather than value retained.
 *
 * `burn` is EXCLUDED from both fees and supply-side revenue. It buys and burns the LAUNCHED coin's own supply,
 * so per fees/AGENTS.md ("subtract the buyback directly from fees rather than adding it to
 * dailySupplySideRevenue") it is netted out rather than reported as supplier income. It is not
 * dailyHoldersRevenue either: that is reserved for the protocol's own value-accrual token, and this burns the
 * launched memecoin.
 *
 * `platformCut` IS counted, as ordinary protocol revenue. PadRouter.withdrawPlatformCut() pays it to owner()
 * and nowhere else, so on-chain it is simply ETH retained by the treasury. The team's stated intent is to buy
 * back the protocol token with it off-chain, but nothing on-chain executes or proves that, so this adapter
 * does not book it as dailyHoldersRevenue. If those buybacks ever land on-chain and become traceable, this is
 * the line to move.
 *
 * REWARD LEGS: when a RewardVault is wired, PadRouter charges an extra 0.25% on top of the fee above and
 * routes it to traders (buys) or coin holders (sells), emitting RewardAccrued. That is a real fee the trader
 * paid and a real cost of funds, so it is added to BOTH dailyFees and dailySupplySideRevenue. The legs are off
 * whenever rewardVault == address(0), in which case no event is emitted and these terms are simply zero.
 *
 * GRADUATION: the curve pays a fixed 0.5 ETH to the protocol and 0.5 ETH to the creator, each capped at a
 * quarter of the raise. CurvePool emits Graduated.raisedWeth AFTER deducting both, so the cap has to be
 * re-derived from the gross raise — see the inversion below.
 */

// PadRouter — the swap desk every trade routes through. Deployed 2026-07-24, verified on Blockscout:
// https://robinhoodchain.blockscout.com/address/0xA6BaAB820809C7fC8350311776627298f91F07eC
const PAD_ROUTER = "0xA6BaAB820809C7fC8350311776627298f91F07eC";
// Deployment block of the stack; nothing can be emitted before it, so log scans start here.
const ROUTER_DEPLOYED_BLOCK = 17752965;

// CurvePool.GRAD_REWARD — a fixed 0.5 ETH paid to the protocol and to the creator when a coin graduates,
// each capped at raise/4 by the same contract. Source: contracts/CurvePool.sol in Robinlabz/Labs.
const GRAD_REWARD_WEI = 500000000000000000n;

const TRADING_VOLUME = "Trading Volume";

const BOUGHT_EVENT = "event Bought(address indexed token, address indexed buyer, uint256 ethIn, uint256 fee, uint256 tokensOut)";
const SOLD_EVENT = "event Sold(address indexed token, address indexed seller, uint256 tokensIn, uint256 fee, uint256 ethOut)";
const FEE_SPLIT_EVENT = "event FeeSplit(address indexed token, uint256 platform, uint256 deferred, uint256 platformCut, uint256 dev, uint256 floor, uint256 burn)";
const GRADUATED_EVENT = "event Graduated(address indexed bond, uint256 raisedWeth, uint256 leftoverToken)";
// Emitted only when a RewardVault is wired; the extra 0.25% leg rides on top of the fee in FeeSplit.
const REWARD_ACCRUED_EVENT = "event RewardAccrued(address indexed token, uint8 side, uint256 amount)";
const LAUNCHED_EVENT = "event Launched(address indexed token, address indexed curve, address indexed pool, address dev, uint256 devBought)";

// CurvePadFactory v1, verified on Blockscout:
// https://robinhoodchain.blockscout.com/address/0x8aa92d5297fEC45cbC7F16A32F4aed5D3AC58074
// WHEN v2 DEPLOYS, ADD ITS ADDRESS HERE — graduation rewards from v2 coins are invisible otherwise, and the
// adapter will silently under-report revenue with no error to notice.
const PAD_FACTORIES = ["0x8aa92d5297fEC45cbC7F16A32F4aed5D3AC58074"];

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [bought, sold, feeSplits, rewardLegs] = await Promise.all([
    options.getLogs({ target: PAD_ROUTER, eventAbi: BOUGHT_EVENT }),
    options.getLogs({ target: PAD_ROUTER, eventAbi: SOLD_EVENT }),
    options.getLogs({ target: PAD_ROUTER, eventAbi: FEE_SPLIT_EVENT }),
    options.getLogs({ target: PAD_ROUTER, eventAbi: REWARD_ACCRUED_EVENT }),
  ]);

  // Volume is the ETH leg of each trade: what a buyer put in, what a seller took out.
  for (const log of bought) dailyVolume.addGasToken(log.ethIn, TRADING_VOLUME);
  for (const log of sold) dailyVolume.addGasToken(log.ethOut, TRADING_VOLUME);

  for (const log of feeSplits) {
    const toProtocol = log.platform + log.deferred + log.platformCut;
    // log.burn is deliberately absent: it is a buyback of the launched coin, netted out of fees per the
    // guidelines rather than reported as supplier income.
    const toSupplySide = log.dev + log.floor;

    dailyFees.addGasToken(toProtocol + toSupplySide, METRIC.SWAP_FEES);
    dailyRevenue.addGasToken(toProtocol, "Trading Fees to Protocol");
    dailyProtocolRevenue.addGasToken(toProtocol, "Trading Fees to Protocol");
    dailySupplySideRevenue.addGasToken(log.dev, METRIC.CREATOR_FEES);
    dailySupplySideRevenue.addGasToken(log.floor, "Trading Fees to Coin Floor");
  }

  // The 0.25% reward leg is charged on top of the fee and paid straight out to traders/holders, so it is both
  // a fee and a cost of funds. Zero rows here whenever the vault is unset.
  for (const log of rewardLegs) {
    dailyFees.addGasToken(log.amount, "Trader and Holder Rewards");
    dailySupplySideRevenue.addGasToken(log.amount, "Trader and Holder Rewards");
  }

  // Graduation: a fixed 0.5 ETH to the protocol and 0.5 ETH to the creator, each capped at raise/4.
  const launches = await options.getLogs({
    targets: PAD_FACTORIES,
    eventAbi: LAUNCHED_EVENT,
    fromBlock: ROUTER_DEPLOYED_BLOCK,
    cacheInCloud: true,
    flatten: true,
  });
  const curves = launches.map((l: any) => l.curve);
  if (curves.length) {
    const graduations = await options.getLogs({ targets: curves, eventAbi: GRADUATED_EVENT, flatten: true });
    for (const log of graduations) {
      // CurvePool does `reward = min(GRAD_REWARD, gross/4)` and then emits `raisedWeth = gross - 2*reward`,
      // so the emitted number is NET. Invert it: the cap binds exactly when gross >= 4*GRAD_REWARD, which
      // after the deduction is net >= 2*GRAD_REWARD. Below that the curve paid gross/4 apiece, and since
      // net = gross - 2*(gross/4) = gross/2, each reward is simply net/2.
      const reward = log.raisedWeth >= 2n * GRAD_REWARD_WEI ? GRAD_REWARD_WEI : log.raisedWeth / 2n;
      dailyFees.addGasToken(reward * 2n, "Graduation Rewards");
      dailyRevenue.addGasToken(reward, "Graduation Reward to Protocol");
      dailyProtocolRevenue.addGasToken(reward, "Graduation Reward to Protocol");
      dailySupplySideRevenue.addGasToken(reward, "Graduation Reward to Creator");
    }
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
}

const methodology = {
  Volume: "The ETH leg of every buy and sell routed through the Robin Labs swap desk.",
  Fees: "Per-coin trading fees of 1%-4% per side, chosen by each creator at launch and immutable afterwards, the 0.25% trader/holder reward leg when a RewardVault is wired, and the fixed rewards paid out when a coin graduates. The share of each fee used to buy back and burn the launched coin is netted out rather than counted.",
  Revenue: "The protocol's share of trading fees, including the portion deferred until a coin graduates and the 25% treasury cut of above-default fee tiers, plus the protocol's graduation reward.",
  ProtocolRevenue: "All protocol revenue is retained by the treasury. The live deployment has no on-chain path routing any of it to token holders, so none is booked as holders revenue.",
  SupplySideRevenue: "The creator's share of trading fees and their graduation reward, the share minted into that coin's permanent buy wall, and the 0.25% reward leg paid out to traders and coin holders.",
};

const breakdownMethodology = {
  Volume: { [TRADING_VOLUME]: "ETH in on buys and ETH out on sells, routed through the swap desk." },
  Fees: {
    [METRIC.SWAP_FEES]: "The full per-side trading fee paid by the trader.",
    "Graduation Rewards": "0.5 ETH to the protocol and 0.5 ETH to the creator when a coin graduates, each capped at a quarter of the raise.",
    "Trader and Holder Rewards": "The 0.25% leg charged on top of the fee and paid to traders on buys and coin holders on sells.",
  },
  Revenue: {
    "Trading Fees to Protocol": "The protocol's share of each trading fee, plus the graduation-deferred portion and the 25% treasury cut of above-default tiers.",
    "Graduation Reward to Protocol": "The protocol's fixed reward when a coin graduates.",
  },
  ProtocolRevenue: {
    "Trading Fees to Protocol": "The protocol's share of each trading fee, plus the graduation-deferred portion and the 25% treasury cut of above-default tiers.",
    "Graduation Reward to Protocol": "The protocol's fixed reward when a coin graduates.",
  },
  SupplySideRevenue: {
    [METRIC.CREATOR_FEES]: "The coin creator's share of each trading fee, claimable from escrow.",
    "Trading Fees to Coin Floor": "Minted into that coin's permanent buy wall; the protocol has no withdraw path to it.",
    "Graduation Reward to Creator": "The creator's fixed reward when their coin graduates.",
    "Trader and Holder Rewards": "The 0.25% leg paid straight out to traders on buys and coin holders on sells.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-24",
  methodology,
  breakdownMethodology,
};

export default adapter;
