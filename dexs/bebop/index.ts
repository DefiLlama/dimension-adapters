import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

// Legacy BopAMM swap contracts kept for historical volume before the BopAmm migration.
const LEGACY_BOP_AMM = ["0x160141A205F5dDcf096BA3F48B7eD21EB52c62EA", "0xdB13ad0fcD134E9c48f2fDaEa8f6751a0F5349ca"];
const legacySwapEvent = "event Swap(address indexed sender, address indexed srcToken, address indexed destToken, uint256 srcAmount, uint256 destAmount)";

// BopAmm swap contracts are listed separately so each emitter keeps its own start date.
const bopAmmSwapEvent = "event Swapped(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address recipient)";

const getStartTimestamp = (start: string) => Date.parse(`${start}T00:00:00Z`) / 1e3;

const swapSources = [
  {
    label: "BopAMM (Legacy)",
    targets: LEGACY_BOP_AMM,
    start: "2026-05-12",
    eventAbi: legacySwapEvent,
    tokenIn: "srcToken",
    amountIn: "srcAmount",
    tokenOut: "destToken",
    amountOut: "destAmount",
  },
  {
    label: "BopAmm",
    targets: ["0xB09AaA5614916d7AEb59C295C52c92ca82aDdD76"],
    start: "2026-07-28",
    eventAbi: bopAmmSwapEvent,
    tokenIn: "tokenIn",
    amountIn: "amountIn",
    tokenOut: "tokenOut",
    amountOut: "amountOut",
  },
  {
    label: "BopAmm",
    targets: ["0xB09AAA8933626d7E4C48D65dAd2D77021CFBCA9a"],
    start: "2026-09-16",
    eventAbi: bopAmmSwapEvent,
    tokenIn: "tokenIn",
    amountIn: "amountIn",
    tokenOut: "tokenOut",
    amountOut: "amountOut",
  },
];

async function fetch(options: FetchOptions) {
  const { getLogs, createBalances } = options;
  const dailyVolume = createBalances();
  for (const source of swapSources) {
    if (options.endTimestamp <= getStartTimestamp(source.start)) continue;
    const logs = await getLogs({ targets: source.targets, eventAbi: source.eventAbi });
    logs.forEach((log: any) => {
      addOneToken({
        chain: options.chain,
        balances: dailyVolume,
        token0: log[source.tokenIn],
        amount0: log[source.amountIn],
        token1: log[source.tokenOut],
        amount1: log[source.amountOut],
        label: source.label,
      });
    });
  }
  return { dailyVolume };
}

const methodology = {
  Volume: "Volume from successful BopAMM swaps, counted from legacy BopAMM Swap events and current BopAmm Swapped events. Router fallback swaps are excluded because they settle through Bebop RFQ instead of the BopAMM pool.",
}

const breakdownMethodology = {
  Volume: {
    "BopAMM (Legacy)": "Volume from legacy BopAMM Swap events.",
    BopAmm: "Volume from current BopAmm Swapped events.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  pullHourly: true,
  chains: [CHAIN.ETHEREUM],
  start: "2026-05-12",
  methodology,
  breakdownMethodology,
};

export default adapter;
