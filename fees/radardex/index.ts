import { AbiCoder } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// RadarDEX (radardex.pro) - direct-to-Uniswap-V3 launchpad on Arc, no bonding curve.
// Docs: radardex.pro/docs. Two independent launch mechanisms sharing the "RadarDEX"
// brand; only the Reflection mechanism is tracked here (see note below).
//
// Reflection Launch: 1% trading fee, paid entirely in USDC regardless of the pool's
// quote asset, split 50% to the launched token's holders (pro-rata by balance) and
// 50% to the deployer. RadarDEX itself keeps none of it (confirmed both by the docs
// and by every real distribution observed on-chain).
//
// RadarDEX's contracts are not verified/source-published anywhere reachable, so this
// event is matched by its raw topic0 hash and decoded manually - an `eventAbi` string
// needs the exact real event name to derive a matching topic filter, and the name
// isn't recoverable from the hash, only the field layout is, from raw log data.
const REFLECTION_LOCKER = "0x8Ce980d8357E404bfd86456c464Dd046E7c517F8";
const USDC = ADDRESSES.arc.USDC;

// Verified against 66 real on-chain events: the two amount fields are always equal or
// off by one wei (an odd total splitting 50/50 leaves a 1-wei remainder on one side),
// confirming this is the documented holder/deployer split rather than two unrelated
// numbers. The third field is a large accumulator consistent with the standard
// "magnified dividend per share" pattern RadarDEX's docs describe
// (withdrawableDividendOf/claim), not independently confirmed.
const FEES_DISTRIBUTED_TOPIC = "0xcb71511b442d8b7bee0ad3e6900d0676a1f626abeb5c4ee82329713f8f504727";
const abiCoder = AbiCoder.defaultAbiCoder();
const DISTRIBUTED_DATA_TYPES = ["uint256", "uint256", "uint256"];

function decodeDistribution(log: any) {
  const [holderAmount, deployerAmount] = abiCoder.decode(DISTRIBUTED_DATA_TYPES, log.data);
  return { holderAmount, deployerAmount };
}

const HOLDER_DIVIDENDS = "Holder Dividends";
const DEPLOYER_SHARE = "Deployer Share";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const distributions = await options.getLogs({
    target: REFLECTION_LOCKER,
    topic: FEES_DISTRIBUTED_TOPIC,
    entireLog: true,
  });
  for (const log of distributions) {
    const { holderAmount, deployerAmount } = decodeDistribution(log);
    dailyFees.add(USDC, holderAmount, HOLDER_DIVIDENDS);
    dailyFees.add(USDC, deployerAmount, DEPLOYER_SHARE);
    dailySupplySideRevenue.add(USDC, holderAmount, HOLDER_DIVIDENDS);
    dailySupplySideRevenue.add(USDC, deployerAmount, DEPLOYER_SHARE);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    // RadarDEX keeps nothing from reflection-launch trading fees: both halves are
    // supply side (the launched token's own holders and its deployer), so protocol
    // revenue is a genuine, documented zero here, not an unknown.
    dailyRevenue: options.createBalances(),
    dailyProtocolRevenue: options.createBalances(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "1% trading fee on RadarDEX Reflection-launch pools, always denominated in USDC regardless of the pool's own quote asset, read from each fee distribution event.",
  UserFees: "Same as Fees: the full trading fee is paid by traders.",
  Revenue: "None. RadarDEX takes no cut of Reflection-launch fees; the entire 1% goes to the launched token's holders and its deployer.",
  ProtocolRevenue: "None, for the same reason as Revenue.",
  SupplySideRevenue: "The full 1% trading fee: 50% streamed to the launched token's holders pro-rata by balance, 50% to the deployer.",
};

const breakdownMethodology = {
  Fees: {
    [HOLDER_DIVIDENDS]: "Half of the 1% trading fee, streamed to the launched token's holders pro-rata by balance.",
    [DEPLOYER_SHARE]: "Half of the 1% trading fee, paid to the token's deployer.",
  },
  UserFees: {
    [HOLDER_DIVIDENDS]: "Half of the 1% trading fee, streamed to the launched token's holders pro-rata by balance.",
    [DEPLOYER_SHARE]: "Half of the 1% trading fee, paid to the token's deployer.",
  },
  SupplySideRevenue: {
    [HOLDER_DIVIDENDS]: "Half of the 1% trading fee, streamed to the launched token's holders pro-rata by balance.",
    [DEPLOYER_SHARE]: "Half of the 1% trading fee, paid to the token's deployer.",
  },
};

// Not yet covered: the "Classic Launch" mechanism (70% deployer / 30% protocol,
// separate LaunchFactory/FeeSplitLocker contracts). No fee distribution event has
// fired for it on-chain yet in any block range checked, so there is nothing to verify
// a per-token fee split against; adding it on the strength of the docs alone, with no
// on-chain confirmation, would be exactly the "flat rate times notional" pattern this
// repo's guidelines reject. Revisit once Classic-mode fees are actually collected.
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
