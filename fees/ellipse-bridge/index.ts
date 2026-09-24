import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Ellipse Bridge - RWA claim tokens on Arc, backed 1:1 by custody vaults on each
// asset's origin chain. CRCL and GLD are held on Robinhood Chain, USDT and BTCB on
// BSC; Arc gets bCRCL, bGLD, bUSDT and bBTCB against them. The TVL adapter for the
// same protocol counts those custody reserves; this one counts what users pay to
// cross.
//
// TWO FEES, and they are independent of each other:
//
//  1. The bridge fee, charged by the asset's controller on Arc. It is taken in BOTH
//     directions and at the same rate: on the way in the controller mints the fee to
//     the fee recipient and the user the rest, and on the way out `requestRedemption`
//     burns the gross from the user and re-mints the fee. Measured over seven days,
//     redemptions were about three quarters of it - reading only the mint side would
//     have under-reported the bridge by roughly four times.
//
//  2. The fast-lane fee, charged by an optional router that skips the queue. On an
//     origin chain the router takes its cut of the deposit before handing the rest to
//     the custody vault; on Arc it takes its cut of the claim tokens before calling
//     the controller. A fast-lane user therefore pays both fees, which is not double
//     counting: they are two charges on one journey, taken by two contracts.
//
// There is no supply side here. Nothing is paid to liquidity providers or to anyone
// outside the protocol - the fee is minted or transferred straight to the treasury -
// so fees, revenue and protocol revenue are the same number.

// WHICH TOKEN THE FEE IS TAKEN IN depends on which side it is taken on. Everything
// charged on Arc - the bridge fee in both directions, and the fast lane's cut of a
// redemption - is taken in the CLAIM token (bCRCL, bGLD...). A fast-lane DEPOSIT is
// charged on the origin chain instead, before the asset ever becomes a claim, so that
// one is taken in the origin token itself.
//
// The claim token has no price of its own anywhere: it is a claim, and its whole
// worth is the origin asset sitting in the vault. So it too is valued as that origin
// asset, which DefiLlama already prices for the TVL adapter. Verified: all four claim
// tokens carry the same 18 decimals as their origin token, so the amounts transfer
// across without scaling. Either way every fee ends up denominated in the same four
// origin assets, which is what makes the two sides add up.
const ASSETS = [
  {
    symbol: "bCRCL",
    controller: "0xd35044fdf2495600199b130fcbfcbd0102886d08", // Arc, from block 20359093
    vault: "0xed811a67c40b25d02a39492d91aaab335b2cbd92",      // Robinhood Chain
    originChain: CHAIN.ROBINHOOD,
    originToken: "0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5",
  },
  {
    symbol: "bGLD",
    controller: "0x84f1b51d17fe8bf0096c01418f114f85f45e36bb", // Arc, from block 19486848
    vault: "0x96f98ba395976b0a7d62088a597cd8b71233a3fe",      // Robinhood Chain
    originChain: CHAIN.ROBINHOOD,
    originToken: "0xC9a981FEE1F9DEc688bb123ccDeCc63D0deBFC4e",
  },
  {
    symbol: "bBTCB",
    controller: "0x6f553f6f26261d2568cd7c1deb46ba95742e0de7", // Arc, from block 20722758
    vault: "0x2f8dd161539ff04ff63f2c1303e671732450a7e0",      // BSC
    originChain: CHAIN.BSC,
    originToken: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
  },
  {
    symbol: "bUSDT",
    controller: "0x83e176b67eb66924686879b4dd10add4113baf02", // Arc, from block 20147950
    vault: "0x402c61c3620d915c5cc4160dd059a5f199c96d23",      // BSC
    originChain: CHAIN.BSC,
    originToken: "0x55d398326f99059fF775485246999027B3197955",
  },
];

// One fast-lane router per chain, each deployed 2026-09-15. The lists a router is
// built with are immutable, so a new route means a new router rather than an edit to
// one of these - if a fifth asset ever appears here, its router address has to be
// added alongside it.
const FAST_ROUTER = {
  [CHAIN.ARC]: "0x4b6fa68debb9592d0572f424baf4bfc24d1327af",
  [CHAIN.ROBINHOOD]: "0x12cc099ff9fdaa336862d4d7177233e075bff3a6",
  [CHAIN.BSC]: "0xfb276635a5b0e7c63cf3724615c75062ac91255d",
};

// Minted carries the fee outright. RedemptionRequested does not - it carries the
// gross burned and the net owed on the origin chain, and the fee is the gap.
//
// THE GAP IS THE FEE AND NOTHING ELSE. The controller computes net as gross minus its
// own fee and nothing more; the pro-rata reduction that applies when a reserve is
// short of full coverage lives in the custody vault on the ORIGIN chain, at release
// time, and never touches the numbers in this event. A user redeeming against a
// short reserve receives less than net, but the fee minted to the protocol is still
// exactly this gap. Checked against the contract's own fee function - one percent,
// floored at a per-asset minimum - over every redemption of a seven-day window: 97
// of 97 matched to the wei.
const MINTED_EVENT =
  "event Minted(bytes32 indexed depositId, address indexed to, uint256 gross, uint256 net, uint256 fee)";
const REDEMPTION_EVENT =
  "event RedemptionRequested(bytes32 indexed redemptionId, address indexed from, address indexed originRecipient, uint256 gross, uint256 net, uint256 nonce)";
// The fast-lane events name the vault (origin side) or the controller (Arc side) they
// went through, which is what says in which asset the fee was taken.
const FAST_DEPOSIT_EVENT =
  "event FastDeposit(bytes32 indexed depositId, address indexed user, address indexed vault, address destRecipient, uint256 amount, uint256 fee, uint256 bridged)";
const FAST_REDEMPTION_EVENT =
  "event FastRedemption(bytes32 indexed redemptionId, address indexed user, address indexed controller, address originRecipient, uint256 amount, uint256 fee, uint256 bridged)";

const BRIDGE_FEES = METRIC.MINT_REDEEM_FEES;
const FAST_LANE_FEES = "Fast Lane Fees";

const byController = Object.fromEntries(ASSETS.map((a) => [a.controller, a]));
const byVault = Object.fromEntries(ASSETS.map((a) => [a.vault, a]));

const sameEverywhere = (dailyFees: any) => ({
  dailyFees,
  dailyRevenue: dailyFees,
  dailyProtocolRevenue: dailyFees,
  dailySupplySideRevenue: 0,
});

// Arc: both directions of the bridge fee, plus the fast lane's cut of redemptions.
const fetchArc = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const origin = (asset: (typeof ASSETS)[number]) => `${asset.originChain}:${asset.originToken}`;
  const controllers = ASSETS.map((asset) => asset.controller);

  // flatten: false keeps one log list per controller, in the same order as ASSETS,
  // because neither event names the asset the fee was taken in.
  const [mintedByController, redeemedByController, fast] = await Promise.all([
    options.getLogs({ targets: controllers, eventAbi: MINTED_EVENT, flatten: false }),
    options.getLogs({ targets: controllers, eventAbi: REDEMPTION_EVENT, flatten: false }),
    options.getLogs({ target: FAST_ROUTER[CHAIN.ARC], eventAbi: FAST_REDEMPTION_EVENT }),
  ]);

  ASSETS.forEach((asset, i) => {
    const token = origin(asset);
    for (const log of mintedByController[i])
      dailyFees.add(token, log.fee, { skipChain: true, label: BRIDGE_FEES });
    for (const log of redeemedByController[i])
      dailyFees.add(token, BigInt(log.gross) - BigInt(log.net), { skipChain: true, label: BRIDGE_FEES });
  });

  for (const log of fast) {
    const asset = byController[log.controller.toLowerCase()];
    if (!asset) continue; // a controller this router does not serve cannot reach here
    dailyFees.add(origin(asset), log.fee, { skipChain: true, label: FAST_LANE_FEES });
  }

  return sameEverywhere(dailyFees);
};

// Origin chains: only the fast lane charges anything here. The bridge's own fee is
// taken on Arc in both directions, so a deposit on this side pays nothing yet - it
// pays when the claim tokens are minted, and that is counted on Arc.
const fetchOrigin = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const logs = await options.getLogs({
    target: FAST_ROUTER[options.chain as keyof typeof FAST_ROUTER],
    eventAbi: FAST_DEPOSIT_EVENT,
  });
  for (const log of logs) {
    const asset = byVault[log.vault.toLowerCase()];
    if (!asset || asset.originChain !== options.chain) continue;
    // Native to this chain: the router keeps its cut of the asset being deposited.
    dailyFees.add(asset.originToken, log.fee, { label: FAST_LANE_FEES });
  }
  return sameEverywhere(dailyFees);
};

const methodology = {
  Fees: "What users pay to cross the bridge. The asset's controller on Arc charges the same rate in both directions - on the way in it mints the fee to the protocol and the rest to the user, on the way out it burns the gross and re-mints the fee - and an optional fast-lane router charges its own cut on top for skipping the queue, on the origin chain when depositing and on Arc when redeeming. Anything charged on Arc is taken in the claim token (bCRCL, bGLD, bUSDT, bBTCB), which is a 1:1 claim on the asset held in custody and is therefore valued as that origin asset; a fast-lane deposit is charged on the origin chain instead, before the asset becomes a claim, so it is taken in the origin token directly. Either way the fee is denominated in the same four origin assets.",
  Revenue: "All the bridge fees and the fast-lane fees go to the protocol's treasury with nothing paid out of it.",
  ProtocolRevenue: "All the bridge fees and the fast-lane fees go to the protocol's treasury with nothing paid out of it.",
  SupplySideRevenue: "None. The bridge has no liquidity providers - claim tokens are backed by custody reserves, not by a pool, so there is no supplier to pay.",
};

const breakdownMethodology = {
  Fees: {
    [BRIDGE_FEES]: "The bridge's own fee, charged by the asset's controller on Arc at the same rate in both directions: read directly from the mint event, and as the gap between gross burned and net released on the redemption event.",
    [FAST_LANE_FEES]: "The fast-lane router's cut, paid only by users who choose to skip the queue: taken from the deposit on the origin chain, in the origin token, and from the claim tokens on Arc when redeeming.",
  },
  Revenue: {
    [BRIDGE_FEES]: "Kept in full by the protocol.",
    [FAST_LANE_FEES]: "Kept in full by the protocol.",
  },
  ProtocolRevenue: {
    [BRIDGE_FEES]: "Kept in full by the protocol.",
    [FAST_LANE_FEES]: "Kept in full by the protocol.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  adapter: {
    // The oldest controller, bGLD, went live on 2026-09-06; the others followed.
    [CHAIN.ARC]: { fetch: fetchArc, start: "2026-09-06" },
    // The fast lane is younger than the bridge: all three routers are from 2026-09-15.
    [CHAIN.ROBINHOOD]: { fetch: fetchOrigin, start: "2026-09-15" },
    [CHAIN.BSC]: { fetch: fetchOrigin, start: "2026-09-15" },
  },
};

export default adapter;
