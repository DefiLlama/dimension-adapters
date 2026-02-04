import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const DENARIA_PERP_PAIR = "0xd07822ee341c11a193869034d7e5f583c4a94872";
const LINEA_USDC = "0x176211869cA2b568f2A7D4EE941E073a821EE1ff";

const EXECUTED_TRADE_EVENT =
  "event ExecutedTrade(address indexed user, bool direction, uint256 tradeSize, uint256 tradeReturn, uint256 currentPrice, uint256 leverage)";

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();

  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();

  const tradeLogs: any[] = await options.getLogs({
    target: DENARIA_PERP_PAIR,
    eventAbi: EXECUTED_TRADE_EVENT,
    fromBlock,
    toBlock,
  });

  // console.log("[Denaria][Volume]", { fromBlock, toBlock, logs: tradeLogs.length });

  for (const log of tradeLogs) {
    const isLong = Boolean(log.direction);

    const tradeSize18 = BigInt(log.tradeSize);     // 1e18
    const price1e8 = BigInt(log.currentPrice);     // 1e8

    // Volume in USD(1e18)
    let volumeUsd18 = 0n;

    if (isLong === false) {
      // SHORT: volume = tradeSize(BTC 1e18) * price(1e8) / 1e8
      volumeUsd18 = (tradeSize18 * price1e8) / BigInt(1e8);
    } else {
      // LONG: volume = tradeSize(USD 1e18)
      volumeUsd18 = tradeSize18;
    }

    // USD(1e18) -> USDC raw(1e6) dividendo per 1e12
    const volumeUsdc6 = volumeUsd18 / BigInt(1e12);
    if (volumeUsdc6 > 0n) dailyVolume.add(LINEA_USDC, volumeUsdc6.toString());
  }

  return { dailyVolume };
}

const methodology = {
  Volume: "All Denaria Perp volume on Linea, computed from ExecutedTrade notional in virtual USD.",
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.LINEA],
  fetch,
  start: "2025-12-14",
  methodology,
};

export default adapter;
