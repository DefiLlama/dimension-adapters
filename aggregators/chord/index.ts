import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { isCoreAsset } from "../../helpers/prices";
import ADDRESSES from '../../helpers/coreAssets.json'

// ChordRouter (UUPS proxy, ex-NullRouter): the same address on every chain Chord is deployed on.
// Source: https://github.com/getchordlabs/chord/blob/main/contracts/src/NullRouter.sol (event in contracts/src/interfaces/INullRouter.sol)
// Proxy verified on Sourcify (Monad): https://sourcify.dev/server/v2/contract/143/0x1b1fee89a381e595fe6536b99ba91f3e16e9601a
const CHORD_ROUTER = "0x1b1fee89a381e595fe6536b99ba91f3e16e9601a";

// Emitted exactly once per swap, at the end of every swap entrypoint (swap, splitSwap, multiHopSwap,
// multiPathSwap, swapPermit2), after all hops and split legs have run - so multi-hop and split routes are one event.
// tokenIn is always an ERC20 (native input is wrapped first, so it shows the wrapped native token).
// tokenOut is address(0) when the output is delivered as the native coin. amountOut is after Chord's fee;
// feeAmount is taken in tokenOut, so the gross output is amountOut + feeAmount.
const SWAP_EVENT = "event Swap(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, uint256 feeAmount, address referrer)";

const NATIVE = ADDRESSES.null;

// start = UTC day of the router's first Swap event on that chain; the comment gives the proxy's deploy block
const chainConfig: Record<string, { start: string }> = {
  [CHAIN.MONAD]: { start: "2026-03-20" }, // block 62584060
  [CHAIN.ROBINHOOD]: { start: "2026-07-29" }, // block of the first Swap event: 22241878
  [CHAIN.ARC]: { start: "2026-09-16" }, // block 21107372
  [CHAIN.AVAX]: { start: "2026-10-01" }, // block 96541698
  [CHAIN.BSC]: { start: "2026-10-01" }, // block 125133493
  [CHAIN.BASE]: { start: "2026-10-01" }, // block 52042118
  [CHAIN.ARBITRUM]: { start: "2026-10-14" }, // block 514842885
  [CHAIN.ETHEREUM]: { start: "2026-10-15" }, // proxy block 26200004, first Swap event 26200028
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const logs = await options.getLogs({ target: CHORD_ROUTER, eventAbi: SWAP_EVENT });

  for (const log of logs) {
    const tokenIn = String(log.tokenIn);
    const tokenOut = String(log.tokenOut);
    // Count one side of each swap: the input, unless only the output is a core (reliably priced) asset.
    if (isCoreAsset(options.chain, tokenIn)) {
      dailyVolume.add(tokenIn, log.amountIn);
    } else if (tokenOut.toLowerCase() === NATIVE) {
      dailyVolume.addGasToken(BigInt(log.amountOut) + BigInt(log.feeAmount));
    } else if (isCoreAsset(options.chain, tokenOut)) {
      dailyVolume.add(tokenOut, BigInt(log.amountOut) + BigInt(log.feeAmount));
    } else {
      dailyVolume.add(tokenIn, log.amountIn);
    }
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    Volume: "Value of every swap executed through the Chord router contract, counted once per swap on its input (or on its output when only the output is a major token). Swaps that Chord's API hands to third-party aggregators do not go through the Chord router and are not counted.",
  },
};

export default adapter;
