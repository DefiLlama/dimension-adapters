import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const GATE_SWAP_ROUTER = "0x0000000025e904C59aFDB33d50F982d46A7FF880";
const GATE_SWAP_ROUTER_ZKSYNC = "0x196a35f7d5fcc9838a4b72a82602e737943d6c07";
const ALPHA_ROUTER = "0x000000003d55f1535A0116376858e6008De1435a";
const ALPHA_ROUTER_LINEA = "0xefE7a50f92b089B06d0e6cbCC85D7584424921B2";
const ALPHA_ROUTER_ZKSYNC = "0xc438733Eb259D18bCA253495b209C3cd82B73902";

const EVENT_SWAP_DETAIL = "event SwapDetail(uint256 amountIn,uint256 amountOut,address tokenIn,address tokenOut,address sender,address receiver)";
const EVENT_ALPHA_ORDER = "event Order(uint160 indexed orderId,address tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut)";
const EEE_NATIVE_TOKEN = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

type ChainConfig = {
  start: string;
  routers: string[];
  alphaRouters?: string[];
};

const config: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: { start: "2026-02-28", routers: [GATE_SWAP_ROUTER], alphaRouters: [ALPHA_ROUTER] },
  [CHAIN.BSC]: { start: "2026-02-28", routers: [GATE_SWAP_ROUTER], alphaRouters: [ALPHA_ROUTER] },
  [CHAIN.BASE]: { start: "2026-02-28", routers: [GATE_SWAP_ROUTER], alphaRouters: [ALPHA_ROUTER] },
  [CHAIN.ARBITRUM]: { start: "2026-02-28", routers: [GATE_SWAP_ROUTER], alphaRouters: [ALPHA_ROUTER] },
  [CHAIN.AVAX]: { start: "2026-02-28", routers: [GATE_SWAP_ROUTER], alphaRouters: [ALPHA_ROUTER] },
  [CHAIN.BLAST]: { start: "2026-02-28", routers: [GATE_SWAP_ROUTER] },
  [CHAIN.LINEA]: { start: "2025-09-10", routers: [GATE_SWAP_ROUTER], alphaRouters: [ALPHA_ROUTER_LINEA] },
  [CHAIN.OPTIMISM]: { start: "2026-02-28", routers: [GATE_SWAP_ROUTER] },
  [CHAIN.GATE_LAYER]: { start: "2026-02-28", routers: [GATE_SWAP_ROUTER], alphaRouters: [ALPHA_ROUTER] },
  [CHAIN.BERACHAIN]: { start: "2026-02-28", routers: [GATE_SWAP_ROUTER], alphaRouters: [ALPHA_ROUTER] },
  [CHAIN.ENI]: { start: "2026-02-28", routers: [GATE_SWAP_ROUTER], alphaRouters: [ALPHA_ROUTER] },
  [CHAIN.SONIC]: { start: "2026-02-28", routers: [GATE_SWAP_ROUTER] },
  [CHAIN.POLYGON]: { start: "2026-03-04", routers: [GATE_SWAP_ROUTER], alphaRouters: [ALPHA_ROUTER] },
  [CHAIN.WC]: { start: "2026-02-28", routers: [GATE_SWAP_ROUTER], alphaRouters: [ALPHA_ROUTER] },
  [CHAIN.ERA]: { start: "2025-09-01", routers: [GATE_SWAP_ROUTER_ZKSYNC], alphaRouters: [ALPHA_ROUTER_ZKSYNC] },
};

function addTokenAmount(balances: any, token: string, amount: string) {
  if (!amount || amount === "0") return;
  const normalizedToken = token.toLowerCase();
  if (normalizedToken === ADDRESSES.null || normalizedToken === EEE_NATIVE_TOKEN) balances.addGasToken(amount);
  else balances.add(token, amount);
}

async function fetch(options: FetchOptions) {
  const { createBalances, chain } = options;
  const dailyVolume = createBalances();
  const chainConfig = config[chain];

  const swapDetailLogs = await options.getLogs({
    targets: chainConfig.routers,
    eventAbi: EVENT_SWAP_DETAIL,
    flatten: true,
  });

  swapDetailLogs.forEach((log: any) => addTokenAmount(dailyVolume, log.tokenOut, log.amountOut));

  if (chainConfig.alphaRouters?.length) {
    const alphaOrderLogs = await options.getLogs({
      targets: chainConfig.alphaRouters,
      eventAbi: EVENT_ALPHA_ORDER,
      flatten: true,
    });

    alphaOrderLogs.forEach((log: any) => addTokenAmount(dailyVolume, log.tokenOut, log.amountOut));
  }

  return { dailyVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Volume: "Gate Swap aggregator volume is calculated from SwapDetail amountOut events and Alpha Order amountOut events across supported chains.",
  },
  adapter: Object.fromEntries(Object.entries(config).map(([chain, { start }]) => [chain, { fetch, start }])),
};

export default adapter;
