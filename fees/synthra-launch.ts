import ADDRESSES from "../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// Synthra Launches — the bonding-curve launchpad of Synthra (synthra.org) on Arc mainnet.
// Docs: https://docs.synthra.org/docs/contract-addresses , https://docs.synthra.org/docs/launchpad-curve
// LaunchPad (create/buy/sell/graduate): 0x18D33De5eefB2F91B09385f35f6a1317659cc1F9, deployed block 13716990.
// Post-graduation trading moves to a Synthra V3 pool and is out of scope here.
const LAUNCH_PAD = "0x18D33De5eefB2F91B09385f35f6a1317659cc1F9";
const USDC = ADDRESSES.arc.USDC; // ERC-20 predeploy 0x3600...0000, 6 decimals; the launchpad's quote asset on Arc

// Verified event signatures (confirmed on-chain: types differ from the docs' untyped parameter names,
// virtualUsdc/virtualTokens/realTokenReserves/realUsdcReserves/buybackPot are uint128, not uint256).
const TRADE =
  "event Trade(address indexed token, address indexed trader, bool isBuy, uint256 usdcAmount, uint256 tokenAmount, uint256 fee, uint128 virtualUsdc, uint128 virtualTokens, uint128 realTokenReserves, uint128 realUsdcReserves)";
const FEE_SPLIT =
  "event FeeSplit(address indexed token, uint256 toProtocol, uint256 toCreator, uint256 toBuybackPot, uint128 buybackPot)";

const PROTOCOL_LABEL = "Launch Curve Fees to Protocol";
const CREATOR_LABEL = "Launch Curve Fees to Creators";
const BUYBACK_LABEL = "Launch Curve Fees to Buyback Pot";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const trades = await options.getLogs({
    target: LAUNCH_PAD,
    eventAbi: TRADE,
  });
  for (const log of trades) {
    // usdcAmount is gross on buys (what the trader paid) but net of fee on sells
    // (what the trader received); add the fee back on sells so volume is gross both ways.
    const usdcAmount = BigInt(log.usdcAmount);
    const fee = BigInt(log.fee);
    dailyVolume.add(USDC, log.isBuy ? usdcAmount : usdcAmount + fee);
  }

  const feeSplits = await options.getLogs({
    target: LAUNCH_PAD,
    eventAbi: FEE_SPLIT,
  });
  for (const log of feeSplits) {
    const toProtocol = BigInt(log.toProtocol);
    const toCreator = BigInt(log.toCreator);
    const toBuyback = BigInt(log.toBuybackPot);
    dailyFees.add(USDC, toProtocol + toCreator + toBuyback, METRIC.TRADING_FEES);
    dailyRevenue.add(USDC, toProtocol, PROTOCOL_LABEL);
    dailySupplySideRevenue.add(USDC, toCreator, CREATOR_LABEL);
    dailySupplySideRevenue.add(USDC, toBuyback, BUYBACK_LABEL);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Gross USDC value of every buy and sell on Synthra Launches bonding curves on Arc, before a launch graduates to a Synthra V3 pool.",
  Fees: "2% curve trading fee on every buy and sell, taken on the input for buys and on the output for sells, valued in USDC.",
  UserFees: "Traders pay the 2% curve fee. Token creation is free (an optional creator-set creation fee up to 100 USDC exists but is not emitted as a discrete event, so it is excluded).",
  Revenue: "Half of the curve fee (1% of volume), pushed to the Synthra protocol treasury.",
  ProtocolRevenue: "Half of the curve fee (1% of volume), pushed to the Synthra protocol treasury.",
  SupplySideRevenue: "The other half of the curve fee, split between the token creator and the launch's buyback-and-burn pot in a ratio the creator fixes at launch.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "2% bonding-curve fee on every Synthra Launches buy and sell, valued in USDC.",
  },
  UserFees: {
    [METRIC.TRADING_FEES]: "2% bonding-curve fee on every Synthra Launches buy and sell, valued in USDC.",
  },
  Revenue: {
    [PROTOCOL_LABEL]: "50% of the curve fee (1% of volume), pushed to the Synthra protocol treasury.",
  },
  ProtocolRevenue: {
    [PROTOCOL_LABEL]: "50% of the curve fee (1% of volume), pushed to the Synthra protocol treasury.",
  },
  SupplySideRevenue: {
    [CREATOR_LABEL]: "Creator's chosen share of the non-protocol half of the fee, claimable by the token creator.",
    [BUYBACK_LABEL]: "Remainder of the non-protocol half of the fee, escrowed and later spent on a fee-free buy-and-burn of the launched token.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.ARC]: { start: "2026-09-14" }, // first Trade/FeeSplit activity on-chain; contract deployed earlier but idle until then
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
