import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const DENARIA_PERP_PAIR = "0xd07822ee341c11a193869034d7e5f583c4a94872";
const LINEA_USDC = "0x176211869cA2b568f2A7D4EE941E073a821EE1ff";

const EXECUTED_TRADE_EVENT =
  "event ExecutedTrade(address indexed user, bool direction, uint256 tradeSize, uint256 tradeReturn, uint256 currentPrice, uint256 leverage)";

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();

  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();

  const tradeLogs: any[] = await options.getLogs({
    target: DENARIA_PERP_PAIR,
    eventAbi: EXECUTED_TRADE_EVENT,
    fromBlock,
    toBlock,
  });

  // console.log("[Denaria][Fees]", { fromBlock, toBlock, logs: tradeLogs.length });

  for (const log of tradeLogs) {
    const isLong = Boolean(log.direction);

    const tradeSize18 = BigInt(log.tradeSize);       // 1e18
    const tradeReturn18 = BigInt(log.tradeReturn);   // 1e18
    const price1e8 = BigInt(log.currentPrice);       // 1e8

    // Fee+slippage in USD(1e18)
    let feeUsd18 = 0n;

    if (isLong === false) {
      // SHORT: fee = (tradeSize * price / 1e8) - tradeReturn
      const volumeUsd18 = (tradeSize18 * price1e8) / BigInt(1e8);
      feeUsd18 = volumeUsd18 - tradeReturn18;
    } else {
      // LONG: fee = tradeSize - (tradeReturn * price / 1e8)
      const tradeReturnUsd18 = (tradeReturn18 * price1e8) / BigInt(1e8);
      feeUsd18 = tradeSize18 - tradeReturnUsd18;
    }

    const feeUsdc6 = feeUsd18 / BigInt(1e12);
    if (feeUsdc6 > 0n) dailyFees.add(LINEA_USDC, feeUsdc6.toString());
  }

  return { dailyFees };
}

const methodology = {
  Fees: "Fees generate from Denaria Perp, calculate in USDC.",
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.LINEA],
  fetch,
  start: "2025-12-14",
  methodology,
};

export default adapter;
