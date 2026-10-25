// Archivo listo para Pull Request en:
// https://github.com/DefiLlama/dimension-adapters/blob/master/aggregators/base-univ4-rfq/index.ts

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const HOOK_ADDRESS = "0xd72CD1d46bA05479583fbB561B558f133BA98088";
const POOL_MANAGER = "0x498581fF718922c3f8e6A244956aF099B2652b2b";

// Evento Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)
const SWAP_EVENT_ABI =
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint128 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";

// Evento ERC20 Transfer para contabilizar el volumen liquidado por el Hook en Base Mainnet
const TRANSFER_EVENT_ABI =
  "event Transfer(address indexed from, address indexed to, uint256 value)";

const TOKENS = [
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
  "0x4200000000000000000000000000000000000006", // WETH
  "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", // cbBTC
  "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22", // cbETH
  "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452", // wstETH
  "0x940181a94A35A4569E4529A3CDfB74e38FD98631", // AERO
  "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42", // EURC
];

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  for (const token of TOKENS) {
    const logs = await options.getLogs({
      target: token,
      eventAbi: TRANSFER_EVENT_ABI,
      topics: [
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
        null as any,
        "0x000000000000000000000000" + HOOK_ADDRESS.slice(2).toLowerCase(),
      ],
    });

    for (const log of logs) {
      dailyVolume.add(token, log.value);
      // 30 bps fee
      dailyFees.add(token, (BigInt(log.value) * 30n) / 10000n);
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2026-10-18",
    },
  },
};

export default adapter;
