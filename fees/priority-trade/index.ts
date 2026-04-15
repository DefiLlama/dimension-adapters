import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { AbiCoder } from "ethers";

const ROUTER = "0x89ad89c9d1fc32cbe204e5780f04cf9b396118eb";

const TOPIC_BUY  = "0x85653fd83480c154866a19aafca55e332d0bf6642fc00eb2b193bad01886775a";
const TOPIC_SELL = "0x813fdb9fd84b445f7faf94257cfddb9ebff12fa570de7f6d46e91065d3c4ad56";

const coder = AbiCoder.defaultAbiCoder();

const fetch_ = async (options: FetchOptions) => {
  const dailyFees   = options.createBalances();
  const dailyVolume = options.createBalances();

  const [buyLogs, sellLogs] = await Promise.all([
    options.getLogs({ target: ROUTER, topic: TOPIC_BUY,  entireLog: true }),
    options.getLogs({ target: ROUTER, topic: TOPIC_SELL, entireLog: true }),
  ]);

  buyLogs.forEach((log: any) => {
    const [, ethIn] = coder.decode(["uint8", "uint256", "uint256"], log.data);
    const ethInBig = BigInt(ethIn.toString());
    dailyVolume.addGasToken(ethInBig);
    dailyFees.addGasToken(ethInBig / BigInt(100), METRIC.TRADING_FEES);
  });

  sellLogs.forEach((log: any) => {
    const [, , netEth] = coder.decode(["uint8", "uint256", "uint256"], log.data);
    const netEthBig = BigInt(netEth.toString());
    const grossEth  = netEthBig * BigInt(100) / BigInt(99);
    dailyVolume.addGasToken(grossEth);
    dailyFees.addGasToken(grossEth - netEthBig, METRIC.TRADING_FEES);
  });

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue:         dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch: fetch_,
  chains: [CHAIN.MEGAETH],
  start: "2026-02-04",
  methodology: {
    Volume:          "Total ETH volume (buys + sells) routed through the Priority Trade bot.",
    Fees:            "1% fee charged on every trade, collected in native ETH by the protocol.",
    Revenue:         "All fees are retained by Priority Trade as protocol revenue.",
    ProtocolRevenue: "All fees flow to the Priority Trade treasury wallet.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "1% trading fee charged on each swap executed through Priority Trade.",
    },
    Revenue: {
      [METRIC.TRADING_FEES]: "Trading fees collected by the Priority Trade protocol.",
    },
  },
};

export default adapter;
