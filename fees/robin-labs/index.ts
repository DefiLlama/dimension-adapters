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
 * `floor` is counted as SUPPLY SIDE, not revenue: it is minted into that coin's permanent buy wall, which the
 * protocol has no withdraw path to. It is value handed to the coin, not retained by the protocol.
 *
 * At graduation the curve pays a fixed reward to the protocol and the creator, capped at a quarter of the
 * raise each, which is booked from the Graduated event.
 */

const PAD_ROUTER = "0xA6BaAB820809C7fC8350311776627298f91F07eC";
const ROUTER_DEPLOYED_BLOCK = 17752965;

const GRAD_REWARD_WEI = 500000000000000000n; // 0.5 ETH to protocol and to creator, each

const BOUGHT_EVENT = "event Bought(address indexed token, address indexed buyer, uint256 ethIn, uint256 fee, uint256 tokensOut)";
const SOLD_EVENT = "event Sold(address indexed token, address indexed seller, uint256 tokensIn, uint256 fee, uint256 ethOut)";
const FEE_SPLIT_EVENT = "event FeeSplit(address indexed token, uint256 platform, uint256 deferred, uint256 platformCut, uint256 dev, uint256 floor, uint256 burn)";
const GRADUATED_EVENT = "event Graduated(address indexed bond, uint256 raisedWeth, uint256 leftoverToken)";
const LAUNCHED_EVENT = "event Launched(address indexed token, address indexed curve, address indexed pool, address dev, uint256 devBought)";

// v1 factory. WHEN v2 DEPLOYS, ADD ITS ADDRESS HERE — graduation rewards from v2 coins are invisible
// otherwise, and the adapter will silently under-report revenue with no error to notice.
const PAD_FACTORIES = ["0x8aa92d5297fEC45cbC7F16A32F4aed5D3AC58074"];

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [bought, sold, feeSplits] = await Promise.all([
    options.getLogs({ target: PAD_ROUTER, eventAbi: BOUGHT_EVENT }),
    options.getLogs({ target: PAD_ROUTER, eventAbi: SOLD_EVENT }),
    options.getLogs({ target: PAD_ROUTER, eventAbi: FEE_SPLIT_EVENT }),
  ]);

  // Volume is the ETH leg of each trade: what a buyer put in, what a seller took out.
  for (const log of bought) dailyVolume.addGasToken(log.ethIn);
  for (const log of sold) dailyVolume.addGasToken(log.ethOut);

  for (const log of feeSplits) {
    const toProtocol = log.platform + log.deferred + log.platformCut;
    const toSupplySide = log.dev + log.floor + log.burn;

    dailyFees.addGasToken(toProtocol + toSupplySide, METRIC.SWAP_FEES);
    dailyRevenue.addGasToken(toProtocol, "Trading Fees to Protocol");
    dailySupplySideRevenue.addGasToken(log.dev, METRIC.CREATOR_FEES);
    dailySupplySideRevenue.addGasToken(log.floor, "Trading Fees to Coin Floor");
    dailySupplySideRevenue.addGasToken(log.burn, METRIC.TOKEN_BUY_BACK);
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
      const reward = log.raisedWeth / 4n < GRAD_REWARD_WEI ? log.raisedWeth / 4n : GRAD_REWARD_WEI;
      dailyFees.addGasToken(reward * 2n, "Graduation Rewards");
      dailyRevenue.addGasToken(reward, "Graduation Reward to Protocol");
      dailySupplySideRevenue.addGasToken(reward, "Graduation Reward to Creator");
    }
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue };
}

const methodology = {
  Volume: "The ETH leg of every buy and sell routed through the Robin Labs swap desk.",
  Fees: "Per-coin trading fees of 1%-4% per side, chosen by each creator at launch and immutable afterwards, plus the fixed rewards paid out when a coin graduates.",
  Revenue: "The protocol's share of trading fees, including the portion deferred until a coin graduates and the buy-back cut on above-default fee tiers, plus the protocol's graduation reward.",
  SupplySideRevenue: "The creator's share of trading fees and their graduation reward, the share minted into that coin's permanent buy wall, and the auto-burn share.",
};

const breakdownMethodology = {
  Volume: { [METRIC.SWAP_FEES]: "ETH in on buys and ETH out on sells, routed through the swap desk." },
  Fees: {
    [METRIC.SWAP_FEES]: "The full per-side trading fee paid by the trader.",
    "Graduation Rewards": "0.5 ETH to the protocol and 0.5 ETH to the creator when a coin graduates, each capped at a quarter of the raise.",
  },
  Revenue: {
    "Trading Fees to Protocol": "The protocol's share of each trading fee, plus the graduation-deferred portion and the buy-back cut.",
    "Graduation Reward to Protocol": "The protocol's fixed reward when a coin graduates.",
  },
  SupplySideRevenue: {
    [METRIC.CREATOR_FEES]: "The coin creator's share of each trading fee, claimable from escrow.",
    "Trading Fees to Coin Floor": "Minted into that coin's permanent buy wall; the protocol has no withdraw path to it.",
    [METRIC.TOKEN_BUY_BACK]: "Used to buy and burn that coin's own supply.",
    "Graduation Reward to Creator": "The creator's fixed reward when their coin graduates.",
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
