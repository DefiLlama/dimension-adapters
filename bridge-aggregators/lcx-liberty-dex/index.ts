import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { formatAddress } from "../../utils/utils";

// LCX Liberty DEX: a non-custodial DEX aggregator by LCX Liberty Labs Inc. (LCX USA).
// Cross-chain swaps leave from the same router proxies as same-chain swaps: the router's
// cross-chain module picks a bridge (Across or Circle CCTP) and emits one `CrossChainInitiated`
// per transfer it hands to that bridge, with the asset and amount bridged. This adapter sums
// those amounts on the source chain. The swap before the bridge, if any, is counted by the
// aggregator adapter (aggregators/lcx-liberty-dex), not here.
const ROUTER_1 = "0x0000000000b1ae06c96aB73FF4360d7AeAaB56F0";
const ROUTER_2 = "0x0000000000654902B6Ed6cC240cc81CB4c4a3dff";

// `wrapped` prices a native-coin transfer. Arc has none: its gas coin is USDC itself, whose
// native balance has 18 decimals while the USDC token (0x3600...) has 6, so a native row on Arc
// is skipped rather than priced.
const chainConfig: Record<string, { router: string; wrapped?: string; start: string }> = {
  [CHAIN.ETHEREUM]: { router: ROUTER_1, wrapped: ADDRESSES.ethereum.WETH, start: "2026-09-10" },
  [CHAIN.BASE]: { router: ROUTER_1, wrapped: ADDRESSES.optimism.WETH_1, start: "2026-09-10" },
  [CHAIN.ARBITRUM]: { router: ROUTER_1, wrapped: ADDRESSES.arbitrum.WETH, start: "2026-09-10" },
  [CHAIN.OPTIMISM]: { router: ROUTER_1, wrapped: ADDRESSES.optimism.WETH_1, start: "2026-09-10" },
  [CHAIN.ROBINHOOD]: { router: ROUTER_2, wrapped: ADDRESSES.robinhood.WETH, start: "2026-10-12" },
  [CHAIN.BSC]: { router: ROUTER_2, wrapped: ADDRESSES.bsc.WBNB, start: "2026-10-12" },
  [CHAIN.POLYGON]: { router: ROUTER_2, wrapped: ADDRESSES.polygon.WMATIC_2, start: "2026-10-12" },
  [CHAIN.AVAX]: { router: ROUTER_2, wrapped: ADDRESSES.avax.WAVAX, start: "2026-10-12" },
  [CHAIN.UNICHAIN]: { router: ROUTER_2, wrapped: ADDRESSES.unichain.WETH, start: "2026-10-19" },
  [CHAIN.MONAD]: { router: ROUTER_2, wrapped: ADDRESSES.monad.WMON, start: "2026-10-19" },
  [CHAIN.HYPERLIQUID]: { router: ROUTER_2, wrapped: ADDRESSES.hyperliquid.WHYPE, start: "2026-10-19" },
  [CHAIN.ARC]: { router: ROUTER_2, start: "2026-10-19" },
};
const EVENT_CROSS_CHAIN_INITIATED = "event CrossChainInitiated(bytes32 indexed transferId, address indexed user, bytes32 indexed adapterKey, address sendingAsset, uint256 amount, uint256 dstChainId, address recipient, bytes32 dstPayloadHash, address refundAddress)";

const NATIVE = ADDRESSES.null;

async function fetch({ getLogs, createBalances, chain }: FetchOptions) {
  const { router, wrapped } = chainConfig[chain];
  const priced = (token: string) => (formatAddress(token) === NATIVE ? wrapped : token);

  const dailyBridgeVolume = createBalances();
  const logs = await getLogs({ targets: [router], eventAbi: EVENT_CROSS_CHAIN_INITIATED });
  logs
    .filter((log: any) => priced(log.sendingAsset))
    .forEach((log: any) => dailyBridgeVolume.add(priced(log.sendingAsset)!, log.amount));

  return { dailyBridgeVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    BridgeVolume: "Sum of the amount of every CrossChainInitiated event emitted by the LCX Liberty routers on the source chain: 0x0000000000b1ae06c96aB73FF4360d7AeAaB56F0 on Ethereum, Base, Arbitrum and OP Mainnet, and 0x0000000000654902B6Ed6cC240cc81CB4c4a3dff on Robinhood Chain, BNB Chain, Polygon, Avalanche, Unichain, Monad, HyperEVM and Arc. One event is emitted per transfer handed to a bridge (Across or Circle CCTP), with the asset and amount bridged. Any swap before the bridge is counted as aggregator volume, not here.",
  },
};

export default adapter;
