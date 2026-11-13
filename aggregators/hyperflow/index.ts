import ADDRESSES from "../../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

const chainConfig: Record<string, { routerV2: string; routerV21: string; whype: string; start: string }> = {
  [CHAIN.HYPERLIQUID]: {
    // HyperFlow aggregation router (v2), the router in the hyperflow.fun app config (contractAddresses.aggregationRouter)
    routerV2: "0x980B9271A33c4B31214301fAE584B18dBB9731eC",
    // HyperFlow partner router (v21, added in PR #4437), e.g. LI.FI routes HyperEVM swaps through it with clientData {"source":"lifi"}
    routerV21: "0x0fbe14a7cd24adb08575d67bd39d2290a12126b0",
    whype: ADDRESSES.hyperliquid.WHYPE,
    start: '2025-06-08',
  },
  [CHAIN.ELYSIUM]: {
    routerV2: "0x980B9271A33c4B31214301fAE584B18dBB9731eC",
    routerV21: "0x995E574059e1dD9528C22627773A397Bbb073A22",
    whype: ADDRESSES.elysium.WHYPE,
    start: '2026-10-29',
  },
};

const SwappedV2 = "event Swapped(address sender, address srcToken, address dstToken, address dstReceiver, uint256 spentAmount, uint256 returnAmount)";
const SwappedV21 = "event Swapped(address sender, address srcToken, address dstToken, address dstReceiver, uint256 spentAmount, uint256 returnAmount, bytes clientData, uint256 timestamp)";

const fetch = async (options: FetchOptions) => {
  const { routerV2, routerV21, whype } = chainConfig[options.chain];
  const dailyVolume = options.createBalances();
  const [v2Logs, v21Logs] = await Promise.all([
    options.getLogs({ target: routerV2, eventAbi: SwappedV2 }),
    options.getLogs({ target: routerV21, eventAbi: SwappedV21 }),
  ]);

  // native HYPE is passed as 0xeeee..., price it as WHYPE
  const toToken = (token: string) => token.toLowerCase() === ADDRESSES.GAS_TOKEN_2 ? whype : token;
  for (const log of [...v2Logs, ...v21Logs]) {
    addOneToken({ chain: options.chain, balances: dailyVolume, token0: toToken(log.srcToken), amount0: log.spentAmount, token1: toToken(log.dstToken), amount1: log.returnAmount });
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    Volume: "Volume of swaps routed through the HyperFlow aggregation routers (v2 and the v21 partner router) on HyperEVM and Elysium, from their Swapped events.",
  },
};

export default adapter;
