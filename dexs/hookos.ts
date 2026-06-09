import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const CONTRACTS = {
  BondingCurve: "0x3C4b0F2D3d5bBdf4E0B323f0a8Eec7B02Cce6d40",
  HookOSV4Hook: "0x1B04B20196437F9718FB7fd834fCA0DdAb3446c0",
};

const swapAbi = "event Swap(address indexed token, address indexed trader, bool isBuy, uint256 ethAmount, uint256 tokenAmount, uint256 fee)";
const v4SwapAbi = "event AfterSwap(address indexed pool, address sender, int256 amount0, int256 amount1)";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { getLogs, createBalances } = options;

  const dailyVolume = createBalances();

  // BondingCurve swaps (pre-graduation) — ETH volume
  const swapLogs = await getLogs({
    target: CONTRACTS.BondingCurve,
    eventAbi: swapAbi,
  });
  for (const log of swapLogs) {
    dailyVolume.addGasToken(log.ethAmount);
  }

  // Uniswap v4 swaps via HookOSV4Hook (post-graduation)
  const v4Logs = await getLogs({
    target: CONTRACTS.HookOSV4Hook,
    eventAbi: v4SwapAbi,
  });
  for (const log of v4Logs) {
    const abs0 = log.amount0 < 0n ? -log.amount0 : log.amount0;
    dailyVolume.addGasToken(abs0);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  start: "2024-06-01",
  chains: [CHAIN.BASE],
  methodology: {
    Volume: "Sum of ETH volume from BondingCurve swaps (pre-graduation) and Uniswap v4 swaps via HookOSV4Hook (post-graduation).",
  },
  pullHourly: true,
};

export default adapter;
