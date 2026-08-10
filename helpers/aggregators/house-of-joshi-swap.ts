import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../chains";

type ChainConfig = {
  contract: string;
  start: string;
};

// HojswapRouterV2 deployment addresses and conservative indexing start dates.
const SHARED_ROUTER = "0x2C5F372746330465C3f4084CE6C6aBce22a48B4d";

export const chainConfig: Record<string, ChainConfig> = {
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

export const SWAP_FEE_LABEL = "Swap Fees";
export const PROTOCOL_REVENUE_LABEL = "Swap Fees To Protocol";

function addAsset(balance: ReturnType<FetchOptions["createBalances"]>, token: string, amount: bigint, label?: string) {
  if (token === "0x0000000000000000000000000000000000000000") {
    balance.addGasToken(amount, label);
  } else {
    balance.add(token, amount, label);
  }
}

export async function fetchHouseOfJoshiMetrics(options: FetchOptions) {
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
