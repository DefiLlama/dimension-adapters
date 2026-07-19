import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Diggers launchpad on Robinhood Chain (https://diggers.fun).
// One singleton contract is factory + swap router + sole LP of every launched
// token: each launch seeds the full 1B supply as single-sided liquidity in a
// hookless Uniswap V4 pool (ETH is currency0); liquidity is locked forever.
// https://robinhoodchain.blockscout.com/address/0x4190a197e9c7c8D9ce1095c32e6666A13A996580
const DIGGERS = "0x4190a197e9c7c8D9ce1095c32e6666A13A996580";
const DEPLOY_BLOCK = 12296204;

// Emitted on every swap settled against a Diggers pool (buys and sells,
// including create-time initial buys). `ethAmount` is the ETH leg of the trade.
const SWAPPED =
  "event Swapped(address indexed token, address indexed trader, bool indexed isBuy, uint256 ethAmount, uint256 tokenAmount, uint160 sqrtPriceAfterX96, int24 tickAfter, uint128 liquidityAfter, uint256 ethInPool, uint256 tokenInPool)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const logs = await options.getLogs({ target: DIGGERS, eventAbi: SWAPPED });
  logs.forEach((log) => dailyVolume.addGasToken(log.ethAmount));
  return { dailyVolume };
};

const methodology = {
  Volume:
    "Sum of the ETH leg of every swap settled against a Diggers-created Uniswap V4 pool, from the launchpad's Swapped events.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-17",
  fetch,
  methodology,
  doublecounted: true, // pools live inside the canonical Uniswap V4 PoolManager, so volume is also attributed to Uniswap V4
};

export default adapter;
