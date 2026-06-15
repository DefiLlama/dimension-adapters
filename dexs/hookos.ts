import { parseEther } from "ethers";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// HookOS core contracts on Base (verified on https://basescan.org)
const CONTRACTS = {
  BondingCurve: "0x3C4b0F2D3d5bBdf4E0B323f0a8Eec7B02Cce6d40", // pre-graduation swaps
  HookOSV4Hook: "0x1B04B20196437F9718FB7fd834fCA0DdAb3446c0", // post-graduation Uniswap v4 hook
  Arena: "0x9B3d636C27AD4CDEBFbE1F182B2b63F66Be7adE5",        // PvP battle pots
  CopyTrading: "0xa3e5dE74cd1d42A97A5CC0f45b7A24A73fb52736",  // leader trades + follower copies
  TokenFactory: "0x96c5E38362f86E52389E15a86247fB7326503c8d", // token launches
};

const POOL_MANAGER = "0x498581ff718922c3f8e6a244956af099b2652b2b";
const NATIVE_ETH = "0x0000000000000000000000000000000000000000";
const WETH = "0x4200000000000000000000000000000000000006";

const swapAbi = "event Swap(address indexed token, address indexed trader, bool isBuy, uint256 ethAmount, uint256 tokenAmount, uint256 fee)";
const v4SwapAbi = "event AfterSwap(address indexed pool, address sender, int256 amount0, int256 amount1)";
const initAbi = "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks)";
const battleSettledAbi = "event BattleSettled(uint256 indexed battleId, address winner, uint256 pot, uint256 protocolFee)";
const tradeRecordedAbi = "event TradeRecorded(uint256 indexed leaderId, address indexed token, uint256 ethAmount, bool isBuy)";
const copyExecutedAbi = "event CopyExecuted(uint256 indexed leaderId, address indexed follower, address indexed token, uint256 ethAmount, bool isBuy, int256 pnlWei)";
const tokenCreatedAbi = "event TokenCreated(address indexed token, address indexed creator, string name, string symbol, uint256 initialSupply)";

const isEth = (addr: string) => {
  const a = addr.toLowerCase();
  return a === NATIVE_ETH || a === WETH.toLowerCase();
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { getLogs, createBalances } = options;
  const dailyVolume = createBalances();

  // 1. BondingCurve swaps (pre-graduation) — ETH volume
  const swapLogs = await getLogs({
    target: CONTRACTS.BondingCurve,
    eventAbi: swapAbi,
  });
  for (const log of swapLogs) {
    dailyVolume.addGasToken(log.ethAmount);
  }

  // 2. Uniswap v4 swaps via HookOSV4Hook (post-graduation)
  const v4Logs = await getLogs({
    target: CONTRACTS.HookOSV4Hook,
    eventAbi: v4SwapAbi,
  });

  if (v4Logs.length > 0) {
    const toBlock = await options.getToBlock();
    const initLogs = await getLogs({
      target: POOL_MANAGER,
      eventAbi: initAbi,
      fromBlock: 20000000,
      toBlock,
      cacheInCloud: true,
    });

    const ethSideByPool = new Map<string, number>();
    for (const init of initLogs) {
      if (init.hooks.toLowerCase() !== CONTRACTS.HookOSV4Hook.toLowerCase()) continue;
      const poolAddr = ("0x" + init.id.slice(-40)).toLowerCase();
      const c0IsEth = isEth(init.currency0);
      const c1IsEth = isEth(init.currency1);
      if (c0IsEth === c1IsEth) continue; // only pools with exactly one ETH/WETH side
      ethSideByPool.set(poolAddr, c0IsEth ? 0 : 1);
    }

    for (const log of v4Logs) {
      const abs0 = log.amount0 < 0n ? -log.amount0 : log.amount0;
      const abs1 = log.amount1 < 0n ? -log.amount1 : log.amount1;
      const ethSide = ethSideByPool.get(log.pool.toLowerCase());
      if (ethSide === undefined) continue; // skip pools without a resolved ETH side
      dailyVolume.addGasToken(ethSide === 0 ? abs0 : abs1);
    }
  }

  // 3. Arena battle pots — wager volume
  const battleLogs = await getLogs({
    target: CONTRACTS.Arena,
    eventAbi: battleSettledAbi,
  });
  for (const log of battleLogs) {
    dailyVolume.addGasToken(log.pot);
  }

  // 4. CopyTrading — leader trades
  const tradeLogs = await getLogs({
    target: CONTRACTS.CopyTrading,
    eventAbi: tradeRecordedAbi,
  });
  for (const log of tradeLogs) {
    dailyVolume.addGasToken(log.ethAmount);
  }

  // 5. CopyTrading — follower copy executions
  const copyLogs = await getLogs({
    target: CONTRACTS.CopyTrading,
    eventAbi: copyExecutedAbi,
  });
  for (const log of copyLogs) {
    dailyVolume.addGasToken(log.ethAmount);
  }

  // 6. TokenFactory launches — 0.001 ETH per launch
  const launchLogs = await getLogs({
    target: CONTRACTS.TokenFactory,
    eventAbi: tokenCreatedAbi,
  });
  const launchVolume = parseEther("0.001") * BigInt(launchLogs.length);
  dailyVolume.addGasToken(launchVolume);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  start: "2024-06-01",
  chains: [CHAIN.BASE],
  methodology: {
    Volume:
      "Sum of ETH volume from: (1) BondingCurve swaps (pre-graduation), " +
      "(2) Uniswap v4 swaps via HookOSV4Hook (post-graduation), " +
      "(3) Arena battle pots (PvP wager volume), " +
      "(4) CopyTrading leader trades and follower copy executions, " +
      "(5) TokenFactory token launches (0.001 ETH per launch). " +
      "All volume denominated in ETH.",
  },
  pullHourly: true,
};

export default adapter;
