import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// MING on BSC: https://ming.family
// A miner deploys BNB on tiles of a round, either directly (Deployed) or through the AutoMiner, which
// deploys for the player (DeployedFor, where `user` is the player and `executor` the AutoMiner).
const GRID_MINING = '0x50518bfb43d526F0342459cF92CB0AeC25D38Fd9';

const fetch = async (options: FetchOptions) => {
  const [direct, viaAutoMiner] = await Promise.all([
    options.getLogs({
      target: GRID_MINING,
      eventAbi: 'event Deployed(uint64 indexed roundId, address indexed user, uint256 amountPerBlock, uint256 blockMask, uint256 totalAmount)',
    }),
    options.getLogs({
      target: GRID_MINING,
      eventAbi: 'event DeployedFor(uint64 indexed roundId, address indexed user, address indexed executor, uint256 amountPerBlock, uint256 blockMask, uint256 totalAmount)',
    }),
  ]);

  const miners = new Set<string>();
  for (const log of [...direct, ...viaAutoMiner]) miners.add(log.user.toLowerCase());

  return { dailyActiveUsers: miners.size };
};

const adapter: SimpleAdapter = {
  // Unique miners over a day cannot be summed from hourly counts, so the day is read whole
  version: 1,
  fetch,
  chains: [CHAIN.BSC],
  start: '2026-11-05',
  methodology: {
    ActiveUsers: "Unique addresses that deployed BNB during the day, directly or through the AutoMiner.",
  },
};

export default adapter;
