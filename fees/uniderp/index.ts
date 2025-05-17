import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ZeroAddress } from "ethers";

const LAUNCH_FEE = 0.00069; // 0.00069 ETH for each token created
const config = {
    [CHAIN.UNICHAIN]: {
      poolManager: "0x1f98400000000000000000000000000000000004", 
      uniderpLauncher: "0x239584404983804085c8Fd69C1e1651ea99680b0", 
      uniderpHook: "0xb4960cd4f9147f9e37a7aa9005df7156f61e4444", 
      start: "2025-04-23",
      fromBlock: 14569072
    },
}

const SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";

const hookEventAbi = "event FeeTaken(uint8 indexed feeType, address indexed token, address indexed receiver, uint256 amount)"
const launcherEventAbi = "event TokenCreated(uint256 lpTokenId, address tokenAddress, address indexed creatorAddress, string symbol, int24 startingTickIfToken0IsNewToken, uint256 amountTokensBought)"
const swapAbi = "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)"
const poolV4Abi = 'event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)'

const getAbsoluteBigInt = (value: bigint): bigint => {
  return value < BigInt(0) ? value * BigInt(-1) : value;
};

const fetchFees = async (options: FetchOptions): Promise<FetchResultV2> => {
  const {getLogs, createBalances} = options;

  const { poolManager,uniderpLauncher, fromBlock, uniderpHook } = config[options.chain]

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();

  // events from hook
  const hookLogs = await getLogs({
    target: uniderpHook,
    skipIndexer: true,
    eventAbi: hookEventAbi,
  });
  
  for (const log of hookLogs) {
    // Fee taken from hook: platform (20%) + token creator (40%) + referrer fee (10%)
    dailyFees.addToken(log.token, log.amount);
    if (log.feeType === 0n) {
      // platform (20%)
      dailyRevenue.addToken(log.token, log.amount);
    }
  }

  // events from launching new token
  const launcherLogs = await getLogs({
    target: uniderpLauncher,
    skipIndexer: true,
    eventAbi: launcherEventAbi,
  });
    // 0.00069 for each token created
  dailyFees.addGasToken(launcherLogs.length * LAUNCH_FEE * 1e18);

  // 0.3% liquidity
  // Get list pools created by uniderp
  const logs = await getLogs({
    target: poolManager,
    skipIndexer: true,
    fromBlock,
    eventAbi: poolV4Abi,
  })
  const poolIds = logs.filter((log: any) => log.hooks.toLowerCase() === uniderpHook).map((log: any) => log.id);
  for (const poolId of poolIds) {
    // Filter all swap events from pools created by uniderp
    const swapLogs = await getLogs({
      target: poolManager,
      skipIndexer: true,
      eventAbi: swapAbi,
      topics: [
        SWAP_TOPIC,
        poolId
      ],
    })
    for (const log of swapLogs) {
      const gasFeeAmount = getAbsoluteBigInt(log.amount0) * 300n / 10000n;
      dailyFees.addGasToken(gasFeeAmount);
      dailyRevenue.addGasToken(gasFeeAmount);
    }
  }

  return { dailyFees, dailyRevenue };
}

const methodology = {
  UserFees: "User pays 1% fees on each swap.",
  ProtocolRevenue: "Treasury receives 0.5% of each swap. (0.2% from swap + 0.3% from LPs)",
  Revenue: "All revenue generated comes from user fees.",
  Fees: "All fees comes from the user."
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.keys(config).reduce((acc, chain) => {
    const { start } = config[chain];
    acc[chain] = {
      fetch: fetchFees,
      start: start,
      meta: {
        methodology
      }
    };
    return acc;
  }, {}),
};

export default adapter;