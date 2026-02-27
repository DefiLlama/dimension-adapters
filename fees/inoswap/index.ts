import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const ROUTERS = [
  "0x025f45a3ec6e90e8e1db1492554c9b10539ef2fc", // AggregationRouterV2 (current)
  "0x95E8f3227eCc2F35213B6fD6fEce6B8854A77dB5", // legacy router (if still emitting)
];

const SWAP_EXECUTED_EVENT =
  "event SwapExecuted(address indexed user, address indexed router, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee, uint256 actualSlippage, uint8 swapType)";

const fetch = async ({ getLogs, createBalances }: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = createBalances();

  const logs = await getLogs({
    targets: ROUTERS,
    eventAbi: SWAP_EXECUTED_EVENT,
  });

  logs.forEach((log: any) => {
    if (!log?.tokenIn || !log?.fee) return;
    dailyFees.add(log.tokenIn, log.fee);
  });

  // Onchain-first historical accounting from SwapExecuted fees.
  // Revenue fields mirror fee stream until treasury/supply split is emitted onchain as separate events.
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailySupplySideRevenue: createBalances(),
    dailyUserFees: dailyFees,
  } as any;
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.CRONOS]: {
      fetch,
      start: "2026-02-01",
      runAtCurrTime: true,
      metadata: {
        methodology: {
          Fees: "Onchain: sum of `fee` from InoSwap router `SwapExecuted` events.",
          Revenue: "Mirrors onchain fee stream from `SwapExecuted` until explicit treasury split events are indexed.",
          ProtocolRevenue: "Mirrors onchain fee stream from `SwapExecuted` until explicit treasury split events are indexed.",
          SupplySideRevenue: "Set to 0 onchain until explicit partner/supply-side distribution events are emitted.",
          UserFees: "Onchain user-paid fees from `SwapExecuted.fee`.",
        },
      },
    },
  },
};

export default adapter;
