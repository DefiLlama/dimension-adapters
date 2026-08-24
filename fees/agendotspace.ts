import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// Agen.space (https://agen.space) is an AI-agent token launchpad on Robinhood Chain
// https://agen.space/metrics
const INSTANT_HOOK = "0xa3a48A91B52e8553a9422f7eD71497d76405B8Cc";

const FEE_TAKEN =
  "event FeeTaken(bytes32 indexed poolId, bool isBuy, uint256 etherLeg, uint256 fee)";


const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyVolume = options.createBalances();

  const logs = await options.getLogs({ target: INSTANT_HOOK, eventAbi: FEE_TAKEN });

  for (const log of logs) {
    const etherLeg = BigInt(log.etherLeg);
    const fee = BigInt(log.fee);

    // 5 000 ppm to protocol (0.50%), 10 000 ppm to creator (1.00%), total 15 000 ppm (1.50%)
    const platformAmount = fee / 3n;
    const creatorAmount = fee - platformAmount;

    dailyVolume.addGasToken(etherLeg);
    dailyFees.addGasToken(fee, METRIC.TRADING_FEES);
    dailyProtocolRevenue.addGasToken(platformAmount, "Trading Fees To Agen Treasury");
    dailySupplySideRevenue.addGasToken(creatorAmount, "Trading Fees To Creators");
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume:
    "ETH value of every trade through an agen.space Uniswap v4 market, covering buys and sells.",
  Fees:
    "1.50% of the ETH leg of every trade, taken by the InstantHook and split between creators and the Agen treasury.",
  Revenue:
    "Agen treasury's 0.50% share of every trade, credited to the platform.",
  ProtocolRevenue:
    "Agen treasury's 0.50% share of every trade, credited to the platform.",
  SupplySideRevenue:
    "1.00% of every trade earned by the token creator.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]:
      "1.50% of the ETH leg of every buy or sell in an agen.space Uniswap v4 pool.",
  },
  Revenue: {
    "Trading Fees To Agen Treasury":
      "Platform's 0.50% share of every trade, credited to the Agen treasury.",
  },
  ProtocolRevenue: {
    "Trading Fees To Agen Treasury":
      "Platform's 0.50% share of every trade, credited to the Agen treasury.",
  },
  SupplySideRevenue: {
    "Trading Fees To Creators":
      "1.00% of every trade earned by the token creator.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  doublecounted: true,
  methodology,
  breakdownMethodology,
  chains: [CHAIN.ROBINHOOD],
  fetch,
  start: "2026-08-14",
};

export default adapter;
