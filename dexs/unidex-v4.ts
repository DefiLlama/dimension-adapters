import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const POSITION_VAULT = "0xd8dc5d42c13b8257b97417e89c118cc46056c117";
const LIQUIDATION_VAULT = "0x8d9db733cfbe8a0da96cb0383233665e93a4caeb";

const toUSD = (raw: bigint) => Number(raw / 1_000_000_000_000_000_000_000_000n) / 1e6;

const fetch = async (options: FetchOptions) => {
  const [increaseLogs, decreaseLogs, closeLogs, liquidateLogs] = await Promise.all([
    options.getLogs({
      target: POSITION_VAULT,
      eventAbi: "event IncreasePosition(uint256 indexed posId, address indexed account, uint256 indexed tokenId, bool isLong, uint256[5] posData)",
    }),
    options.getLogs({
      target: POSITION_VAULT,
      eventAbi: "event DecreasePosition(uint256 indexed posId, address indexed account, uint256 indexed tokenId, bool isLong, int256[3] pnlData, uint256[5] posData)",
    }),
    options.getLogs({
      target: POSITION_VAULT,
      eventAbi: "event ClosePosition(uint256 indexed posId, address indexed account, uint256 indexed tokenId, bool isLong, int256[3] pnlData, uint256[5] posData)",
    }),
    options.getLogs({
      target: LIQUIDATION_VAULT,
      eventAbi: "event LiquidatePosition(uint256 indexed posId, address indexed account, uint256 indexed tokenId, bool isLong, int256[3] pnlData, uint256[5] posData)",
    }),
  ]);

  let volumeRaw = BigInt(0);

  for (const log of [...increaseLogs, ...decreaseLogs, ...closeLogs, ...liquidateLogs])
    volumeRaw += BigInt(log.posData[1]);

  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(toUSD(volumeRaw));

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: '2024-09-20',
};

export default adapter;
