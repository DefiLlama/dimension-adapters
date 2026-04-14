import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Priority Trade — MegaETH native Telegram trading bot
const ROUTER = "0x89ad89c9d1fc32cbe204e5780f04cf9b396118eb";

const EVENT_BUY  = "event TokensBought(uint8 status, uint256 ethAmount, uint256 tokenAmount)";
const EVENT_SELL = "event TokensSold(uint8 status, uint256 tokenAmount, uint256 ethAmount)";

const fetch = async (options: FetchOptions) => {
  const dailyFees   = options.createBalances();
  const dailyVolume = options.createBalances();

  const [buyLogs, sellLogs] = await Promise.all([
    options.getLogs({ target: ROUTER, eventAbi: EVENT_BUY }),
    options.getLogs({ target: ROUTER, eventAbi: EVENT_SELL }),
  ]);

  buyLogs.forEach((log: any) => {
    const ethIn    = BigInt(log.ethAmount.toString());
    const fee      = ethIn / BigInt(100);
    dailyVolume.addGasToken(ethIn, METRIC.SPOT_TRADING_VOLUME);
    dailyFees.addGasToken(fee,   METRIC.TRADING_FEES);
  });

  sellLogs.forEach((log: any) => {
    const netEth   = BigInt(log.ethAmount.toString());
    const grossEth = netEth * BigInt(100) / BigInt(99);
    const fee      = grossEth - netEth;
    dailyVolume.addGasToken(grossEth, METRIC.SPOT_TRADING_VOLUME);
    dailyFees.addGasToken(fee,        METRIC.TRADING_FEES);
  });

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue:         dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Volume:          "Total ETH volume (buys + sells) routed through the Priority Trade bot.",
  Fees:            "1% fee charged on every trade, collected in native ETH by the protocol.",
  Revenue:         "All fees are retained by Priority Trade as protocol revenue.",
  ProtocolRevenue: "All fees flow to the Priority Trade treasury wallet.",
};

const breakdownMethodology = {
  Volume: {
    [METRIC.SPOT_TRADING_VOLUME]: "ETH volume from token buys and sells executed via the Priority Trade Telegram bot.",
  },
  Fees: {
    [METRIC.TRADING_FEES]: "1% trading fee charged on each swap executed through Priority Trade.",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "Trading fees collected by the Priority Trade protocol.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains:  [CHAIN.MEGAETH],
  start:   "2026-02-04",
  methodology,
  breakdownMethodology,
};

export default adapter;
