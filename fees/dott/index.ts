import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// DOTT (DumpFactory), a bonding-curve launchpad on Robinhood Chain. The
// factory deploys one curve contract per launched token; trades happen on
// the individual curves, discovered here via the factory's own Launched
// events (the same TVL adapter already uses this event to enumerate curves
// for its own reserve-summing).
const FACTORY = "0x4B4a24aBbb7b92AFeb12D0Bca3C054fe1E7069E1";
const START_BLOCK = 5025894;

const LAUNCHED_EVENT =
  "event Launched(address indexed token, address indexed curve, address indexed creator, string name, string symbol, string metadata, uint256 firstBuyWei)";
// Event names aren't available from source (curve, factory proxy, and its
// implementation are all unverified on Blockscout) - confirmed via exact
// keccak256(signature) match against the real topic0 hashes observed on
// live Buy/Sell logs, not guessed.
const BUY_EVENT =
  "event Buy(address indexed trader, uint256 ethIn, uint256 tokenOut, uint256 fee, address token)";
const SELL_EVENT =
  "event Sell(address indexed trader, uint256 tokenIn, uint256 ethOut, uint256 fee, address token)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const launchedLogs = await options.getLogs({
    target: FACTORY,
    eventAbi: LAUNCHED_EVENT,
    fromBlock: START_BLOCK,
    toBlock: await options.getToBlock(),
    cacheInCloud: true,
  });
  const curves = launchedLogs.map((log: any) => log.curve);
  if (!curves.length) {
    return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
  }

  const buyLogs = await options.getLogs({ targets: curves, eventAbi: BUY_EVENT });
  const sellLogs = await options.getLogs({ targets: curves, eventAbi: SELL_EVENT });

  // ethIn is already the full gross amount the trader pays - verified via a
  // real buy transaction: tx.value matched ethIn exactly (fee is carved out
  // of this same total internally, not added on top).
  for (const log of buyLogs) {
    dailyVolume.addGasToken(log.ethIn, 'Trade Volume');
    dailyFees.addGasToken(log.fee, METRIC.TRADING_FEES);
  }

  // ethOut is the trader's real payout with the fee already excluded -
  // verified via a real sell transaction's internal transfers: the trader
  // received exactly ethOut, and the fee (same amount as the event's fee
  // field) was paid out separately to a different address (a plain wallet,
  // not a router/splitter). So the true gross notional on a sell is
  // ethOut + fee, matching the same asymmetric convention independently
  // confirmed on based-alpha (#8163) and imf (#8186) - the fee only has a
  // discrete, additional payment on this side, it isn't netted out of
  // ethOut itself.
  for (const log of sellLogs) {
    dailyVolume.addGasToken(log.ethOut, 'Trade Volume');
    dailyVolume.addGasToken(log.fee, 'Trade Volume');
    dailyFees.addGasToken(log.fee, METRIC.TRADING_FEES);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Volume: "Gross ETH notional of every bonding-curve buy and sell on DOTT (DumpFactory), including fees.",
  Fees: "1% trade fee on every curve buy and sell, paid to a single protocol fee-collector wallet.",
  Revenue: "All trade fees accrue to the protocol - the fee-collector address is a plain wallet, not a splitter contract, and no separate creator/holder share was observed.",
  ProtocolRevenue: "Same as Revenue - all trade fees accrue to the protocol.",
};

const breakdownMethodology = {
  Volume: {
    'Trade Volume': "Gross ETH notional of every bonding-curve buy and sell.",
  },
  Fees: {
    [METRIC.TRADING_FEES]: "1% trade fee on every curve buy and sell.",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "All trade fees accrue to the protocol fee-collector wallet.",
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]: "All trade fees accrue to the protocol fee-collector wallet.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: "2026-07-05",
  chains: [CHAIN.ROBINHOOD],
  methodology,
  breakdownMethodology,
};

export default adapter;
