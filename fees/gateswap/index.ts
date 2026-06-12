import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const GATE_SWAP_ROUTER = "0x0000000025e904C59aFDB33d50F982d46A7FF880";
const GATE_SWAP_ROUTER_ZKSYNC = "0x196a35f7d5fcc9838a4b72a82602e737943d6c07";
const ALPHA_ROUTER = "0x000000003d55f1535A0116376858e6008De1435a";
const ALPHA_ROUTER_LINEA = "0xefE7a50f92b089B06d0e6cbCC85D7584424921B2";
const ALPHA_ROUTER_ZKSYNC = "0xc438733Eb259D18bCA253495b209C3cd82B73902";
const SWAP_WITH_FEE_TOPIC = "0x314913a3ad82bc922c46c55a7d53a733529ec009a109f8d74294b821db2572ce";
const EVENT_SWAP_DETAIL = "event SwapDetail(uint256 amountIn,uint256 amountOut,address tokenIn,address tokenOut,address sender,address receiver)";
const EVENT_ALPHA_ORDER = "event Order(uint160 indexed orderId,address tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut)";
const EEE_NATIVE_TOKEN = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const SWAP_FEES = "Swap Fees";
const SWAP_FEES_TO_PROTOCOL = "Swap Fees To Protocol";

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

function getAddressFromTopic(topic: string) {
  return `0x${topic.slice(-40)}`;
}

function parseSwapWithFeeLog(log: any) {
  if (log.topics?.length === 4) {
    return {
      token: getAddressFromTopic(log.topics[1]),
      amount: BigInt(log.topics[3]).toString(),
    };
  }

  const data = log.data?.replace(/^0x/, "") ?? "";
  if (data.length < 64 * 3) return undefined;

  return {
    token: `0x${data.slice(24, 64)}`,
    amount: BigInt(`0x${data.slice(128, 192)}`).toString(),
  };
}

function addFeeAmount(balances: any, token: string, amount: string, label: string) {
  if (!amount || amount === "0") return;
  const normalizedToken = token.toLowerCase();
  if (normalizedToken === ADDRESSES.null || normalizedToken === EEE_NATIVE_TOKEN) balances.addGasToken(amount, label);
  else balances.add(token, amount, label);
}

async function getSwapTxHashes(options: FetchOptions) {
  const chainConfig = config[options.chain];
  const logGroups = await Promise.all([
    options.getLogs({
      targets: chainConfig.routers,
      eventAbi: EVENT_SWAP_DETAIL,
      onlyArgs: false,
      flatten: true,
    }),
    chainConfig.alphaRouters?.length
      ? options.getLogs({
        targets: chainConfig.alphaRouters,
        eventAbi: EVENT_ALPHA_ORDER,
        onlyArgs: false,
        flatten: true,
      })
      : [],
  ]);

  return new Set(
    logGroups
      .flat()
      .map((log: any) => log.transactionHash?.toLowerCase())
      .filter(Boolean)
  );
}

async function fetch(options: FetchOptions) {
  const { createBalances } = options;
  const dailyFees = createBalances();
  const dailyUserFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();

  const [swapTxHashes, logs] = await Promise.all([
    getSwapTxHashes(options),
    options.getLogs({
      topics: [SWAP_WITH_FEE_TOPIC],
      noTarget: true,
      flatten: true,
    }),
  ]);

  logs.forEach((log: any) => {
    if (!swapTxHashes.has(log.transactionHash?.toLowerCase())) return;

    const fee = parseSwapWithFeeLog(log);
    if (!fee) return;
    addFeeAmount(dailyFees, fee.token, fee.amount, SWAP_FEES);
    addFeeAmount(dailyUserFees, fee.token, fee.amount, SWAP_FEES);
    addFeeAmount(dailyRevenue, fee.token, fee.amount, SWAP_FEES_TO_PROTOCOL);
    addFeeAmount(dailyProtocolRevenue, fee.token, fee.amount, SWAP_FEES_TO_PROTOCOL);
  });

  return { dailyFees, dailyUserFees, dailyRevenue, dailyProtocolRevenue };
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: "Fees paid by users to Gate Swap, tracked from SwapWithFee events.",
    UserFees: "Fees paid by users to Gate Swap, tracked from SwapWithFee events.",
    Revenue: "SwapWithFee feeAddr is a Gate/protocol revenue address, so fees are counted as protocol revenue.",
    ProtocolRevenue: "SwapWithFee feeAddr is a Gate/protocol revenue address, so fees are counted as protocol revenue.",
  },
  adapter: Object.fromEntries(Object.entries(config).map(([chain, { start }]) => [chain, { fetch, start }])),
};

export default adapter;
