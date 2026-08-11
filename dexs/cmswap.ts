import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

const BONDING_CURVE = "0x65F6EC30A9E70822721585f6Bba15c40c2F8ab4e";

const SWAP_ABI =
  "event Swap(address indexed sender, bool indexed isBuy, address indexed tokenAddr, uint256 amountIn, uint256 amountOut, uint256 reserveIn, uint256 reserveOut)";

const fetch = async ({ createBalances, getLogs }: FetchOptions) => {
  const dailyVolume = createBalances();

  // Every bonding-curve trade has native KUB on one side and a (usually brand-new, unpriced)
  // launchpad token on the other, so we price off the native leg directly instead of using
  // addOneToken's isCoreAsset guess — bitkub's coreAssets.json doesn't list the native address,
  // so that heuristic would silently price off the token side on every buy.
  const swapLogs = await getLogs({ target: BONDING_CURVE, eventAbi: SWAP_ABI });
  for (const log of swapLogs) {
    const nativeAmount = log.isBuy ? log.amountIn : log.amountOut;
    dailyVolume.add(ADDRESSES.null, nativeAmount);
  }

  return { dailyVolume };
};

const methodology = {
  Volume: "Buy/sell volume on the Junoswap bonding-curve launchpad.",
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: "2026-06-17",
  chains: [CHAIN.BITKUB],
  methodology,
};

export default adapter;