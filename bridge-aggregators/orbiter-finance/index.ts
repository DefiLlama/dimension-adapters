import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const DEFAULT_AGGREGATOR = '0xe530d28960d48708ccf3e62aa7b42a80bc427aef'
const SWAP_ROUTER: Record<string, string> = {
  [CHAIN.UNICHAIN]: '0x70f6060fc8b01b56869feba8361df468f98c2900',
}

const bridgeEvent = "event BridgeExecuted(address indexed sender, address indexed recipient, address inputToken, address outputToken, uint256 inputAmount, bytes extData)";


const fetch = async (options: FetchOptions) => {
  const dailyBridgeVolume = options.createBalances();
  const target = SWAP_ROUTER[options.chain] || DEFAULT_AGGREGATOR;
  const logs = await options.getLogs({
    target,
    eventAbi: bridgeEvent,
  });

  for (const l of logs) {
    dailyBridgeVolume.add(l.inputToken, l.inputAmount);
  }

  return { dailyBridgeVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM, CHAIN.ARBITRUM, CHAIN.HEMI, CHAIN.POLYGON, CHAIN.OPTIMISM, CHAIN.BSC, CHAIN.BASE, CHAIN.SCROLL, CHAIN.LINEA, CHAIN.UNICHAIN, CHAIN.BERACHAIN, CHAIN.SONIC, CHAIN.INK, CHAIN.BLAST, CHAIN.POLYGON_ZKEVM, CHAIN.SCROLL, CHAIN.MANTLE, CHAIN.MODE, CHAIN.FRAXTAL, CHAIN.FUSE, CHAIN.GRAVITY, CHAIN.WC, CHAIN.SONEIUM, CHAIN.CELO]
};

export default adapter;
