import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { AbiCoder } from "ethers";

const ROUTER  = "0x89ad89c9d1fc32cbe204e5780f04cf9b396118eb";
const RPC_URL = "https://mainnet.megaeth.com/rpc";

const TOPIC_BUY  = "0x85653fd83480c154866a19aafca55e332d0bf6642fc00eb2b193bad01886775a";
const TOPIC_SELL = "0x813fdb9fd84b445f7faf94257cfddb9ebff12fa570de7f6d46e91065d3c4ad56";

const coder = AbiCoder.defaultAbiCoder();

async function rpc(method: string, params: any[]): Promise<any> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const d: any = await res.json();
  if (d.error) throw new Error(`RPC error: ${JSON.stringify(d.error)}`);
  return d.result;
}

async function getBlockAtTimestamp(timestamp: number): Promise<number> {
  const latestHex: string = await rpc("eth_blockNumber", []);
  let lo = 0, hi = parseInt(latestHex, 16);

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const block: any = await rpc("eth_getBlockByNumber", ["0x" + mid.toString(16), false]);
    const ts = parseInt(block.timestamp, 16);
    if (ts < timestamp) lo = mid + 1; else hi = mid;
  }
  return lo;
}

async function fetchLogs(fromBlock: number, toBlock: number, topic: string): Promise<any[]> {
  return rpc("eth_getLogs", [{
    address: ROUTER,
    fromBlock: "0x" + fromBlock.toString(16),
    toBlock:   "0x" + toBlock.toString(16),
    topics: [topic],
  }]);
}

const fetch_ = async (options: FetchOptions) => {
  const dailyFees   = options.createBalances();
  const dailyVolume = options.createBalances();

  const [fromBlock, toBlock] = await Promise.all([
    getBlockAtTimestamp(options.startTimestamp),
    getBlockAtTimestamp(options.endTimestamp),
  ]);

  const [buyRaw, sellRaw] = await Promise.all([
    fetchLogs(fromBlock, toBlock, TOPIC_BUY),
    fetchLogs(fromBlock, toBlock, TOPIC_SELL),
  ]);

  // Decode and process buy logs
  buyRaw.forEach((log: any) => {
    const [, ethIn] = coder.decode(["uint8", "uint256", "uint256"], log.data);
    const ethInBig = BigInt(ethIn.toString());
    dailyVolume.addGasToken(ethInBig,              METRIC.SPOT_TRADING_VOLUME);
    dailyFees.addGasToken(ethInBig / BigInt(100),  METRIC.TRADING_FEES);
  });

  // Decode and process sell logs
  sellRaw.forEach((log: any) => {
    const [, , netEth] = coder.decode(["uint8", "uint256", "uint256"], log.data);
    const netEthBig  = BigInt(netEth.toString());
    const grossEth   = netEthBig * BigInt(100) / BigInt(99);
    dailyVolume.addGasToken(grossEth,          METRIC.SPOT_TRADING_VOLUME);
    dailyFees.addGasToken(grossEth - netEthBig, METRIC.TRADING_FEES);
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
  fetch: fetch_,
  chains:  [CHAIN.MEGAETH],
  start:   "2026-02-04",
  methodology,
  breakdownMethodology,
};

export default adapter;
