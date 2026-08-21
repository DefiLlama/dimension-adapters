import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

type ChainConfig = {
  contract: string;
  start: string;
};

// Router deployments are sourced from the project's public app configuration:
// https://github.com/queenjoshi/Swap-Simulation/blob/da9ac37eb59442988e40d578c8fababeb0e90b86/hojswap-next/src/lib/hojswap-router.ts
// Start dates conservatively precede the first indexed swaps so no events are omitted.
const SHARED_ROUTER = "0x2C5F372746330465C3f4084CE6C6aBce22a48B4d";
// HojswapRouterV2 uses address(0) as the native gas-token sentinel.
const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000";

const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: { contract: SHARED_ROUTER, start: "2026-07-16" },
  [CHAIN.BASE]: { contract: "0x6aCaf964bCf4551CC55Afaf12d6e6a8ef7138875", start: "2026-07-14" },
  [CHAIN.POLYGON]: { contract: SHARED_ROUTER, start: "2026-07-14" },
  [CHAIN.BSC]: { contract: SHARED_ROUTER, start: "2026-07-14" },
  [CHAIN.ARBITRUM]: { contract: SHARED_ROUTER, start: "2026-07-14" },
  [CHAIN.OPTIMISM]: { contract: SHARED_ROUTER, start: "2026-07-14" },
  [CHAIN.AVAX]: { contract: SHARED_ROUTER, start: "2026-07-14" },
  [CHAIN.UNICHAIN]: { contract: SHARED_ROUTER, start: "2026-07-14" },
  [CHAIN.CRONOS]: { contract: SHARED_ROUTER, start: "2026-07-14" },
  [CHAIN.ROBINHOOD]: { contract: SHARED_ROUTER, start: "2026-07-14" },
};

const SWAP_EXECUTED =
  "event SwapExecuted(address indexed sender, address indexed recipient, address indexed sellToken, address buyToken, uint256 sellAmount, uint256 feeAmount, uint256 buyAmount, address swapTarget)";

const SWAP_FEE_LABEL = "Swap Fees";
const PROTOCOL_REVENUE_LABEL = "Swap Fees To Protocol";

function addAsset(balance: ReturnType<FetchOptions["createBalances"]>, token: string, amount: bigint, label?: string) {
  if (token === NATIVE_TOKEN) {
    balance.addGasToken(amount, label);
  } else {
    balance.add(token, amount, label);
  }
}

/**
 * Fetches completed HojswapRouterV2 swaps for the requested chain and time window.
 * @param options DefiLlama fetch context used for log queries and balance creation.
 * @returns Daily volume, fees, user fees, and protocol revenue balance collections.
 */
async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyUserFees = options.createBalances();

  const logs = await options.getLogs({
    target: chainConfig[options.chain].contract,
    eventAbi: SWAP_EXECUTED,
  });

  for (const log of logs) {
    const sellAmount = BigInt(log.sellAmount);
    const feeAmount = BigInt(log.feeAmount);

    // sellAmount is the user's gross input and already includes feeAmount.
    addAsset(dailyVolume, log.sellToken, sellAmount);
    addAsset(dailyFees, log.sellToken, feeAmount, SWAP_FEE_LABEL);
    addAsset(dailyRevenue, log.sellToken, feeAmount, PROTOCOL_REVENUE_LABEL);
    addAsset(dailyUserFees, log.sellToken, feeAmount, SWAP_FEE_LABEL);
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailyUserFees };
}

const methodology = {
  Volume: "Gross sell-token amounts routed through HojswapRouterV2, read from its SwapExecuted events. Underlying DEX volume is not attributed as House of Joshi liquidity.",
  Fees: "The 1% House fee paid by users on swaps executed through HojswapRouterV2, using the exact feeAmount emitted for each trade.",
  Revenue: "All House swap fees are retained by the protocol; there is no supply-side fee allocation.",
  ProtocolRevenue: "All the House swap fees are retained by the protocol.",
}

const breakdownMethodology = {
  Fees: {
    [SWAP_FEE_LABEL]: "The feeAmount emitted by HojswapRouterV2 for each completed swap.",
  },
  Revenue: {
    [PROTOCOL_REVENUE_LABEL]: "The full House fee sent to the protocol's configured House wallet.",
  },
  ProtocolRevenue: {
    [PROTOCOL_REVENUE_LABEL]: "The full House fee retained by the protocol.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
}

export default adapter;