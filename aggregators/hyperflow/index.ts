import ADDRESSES from "../../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

// HyperFlow aggregation router (v2), the router in the hyperflow.fun app config (contractAddresses.aggregationRouter)
const ROUTER_V2 = "0x980B9271A33c4B31214301fAE584B18dBB9731eC";
// HyperFlow partner router (v21, added in PR #4437), e.g. LI.FI routes HyperEVM swaps through it with clientData {"source":"lifi"}
const ROUTER_V21 = "0x0fbe14a7cd24adb08575d67bd39d2290a12126b0";

const SwappedV2 = "event Swapped(address sender, address srcToken, address dstToken, address dstReceiver, uint256 spentAmount, uint256 returnAmount)";
const SwappedV21 = "event Swapped(address sender, address srcToken, address dstToken, address dstReceiver, uint256 spentAmount, uint256 returnAmount, bytes clientData, uint256 timestamp)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const [v2Logs, v21Logs] = await Promise.all([
    options.getLogs({ target: ROUTER_V2, eventAbi: SwappedV2 }),
    options.getLogs({ target: ROUTER_V21, eventAbi: SwappedV21 }),
  ]);

  // native HYPE is passed as 0xeeee..., price it as WHYPE
  const toToken = (token: string) => token.toLowerCase() === ADDRESSES.GAS_TOKEN_2 ? ADDRESSES.hyperliquid.WHYPE : token;
  for (const log of [...v2Logs, ...v21Logs]) {
    addOneToken({ chain: options.chain, balances: dailyVolume, token0: toToken(log.srcToken), amount0: log.spentAmount, token1: toToken(log.dstToken), amount1: log.returnAmount });
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2025-06-08',
  methodology: {
    Volume: "Volume of swaps routed through the HyperFlow aggregation routers (v2 and the v21 partner router), from their Swapped events.",
  },
};

export default adapter;
