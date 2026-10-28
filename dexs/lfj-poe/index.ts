import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const FACTORY = "0x78120F2C0EBF0cc8B7E7749e62D36e6523dD711D";

const abi = {
  getPoolsLength: "function getPoolsLength() view returns (uint256)",
  getPoolAt: "function getPoolAt(uint256 index) view returns (address)",
  getTokens: "function getTokens() view returns (address tokenX, address tokenY)",
};

const SWAP_EVENT =
  "event Swap(address indexed sender, address indexed recipient, bool indexed swapXtoY, " +
  "uint256 actualAmountIn, uint256 amountOut, uint256 feeIn, uint256 feeOut)";

const fetch = async (options: FetchOptions) => {
  const { api, createBalances, getLogs } = options;
  const dailyVolume = createBalances();
  const dailyFees = createBalances();

  const length = await api.call({ target: FACTORY, abi: abi.getPoolsLength });
  const pools: string[] = await api.multiCall({
    target: FACTORY, abi: abi.getPoolAt,
    calls: [...Array(Number(length)).keys()],
  });

  const tokens = await api.multiCall({ abi: abi.getTokens, calls: pools });

  const logs = await getLogs({ targets: pools, eventAbi: SWAP_EVENT, flatten: false });

  pools.forEach((_pool, i) => {
    const { tokenX, tokenY } = tokens[i];
    logs[i].forEach((log: any) => {
      const [tokenIn, tokenOut] = log.swapXtoY ? [tokenX, tokenY] : [tokenY, tokenX];
      dailyVolume.add(tokenOut, log.amountOut);
      dailyFees.add(tokenIn,  log.feeIn, METRIC.SWAP_FEES);
      dailyFees.add(tokenOut, log.feeOut, METRIC.SWAP_FEES);
    });
  });

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
    dailySupplySideRevenue: dailyFees,
  };
};

const methodology = {
    Volume: "Total USD value of tokens bought across every POE pool.",
    Fees: "Total swap fees paid by traders across all POE pools.",
    UserFees: "Swap fees paid by traders on each swap.",
    Revenue: "POE takes no protocol fee share.",
    ProtocolRevenue: "POE takes no protocol fee share.",
    SupplySideRevenue: "All swap fees are forwarded to each pool's fee rewarder and distributed to liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by traders on each swap.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by traders on each swap.",
  },
  SupplySideRevenue: {
    [METRIC.SWAP_FEES]: "All the swap fees are forwarded to each pool's fee rewarder and distributed to liquidity providers.",
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  pullHourly: true,
  fetch,
  start: '2026-05-07',
  chains: [CHAIN.MONAD],
  breakdownMethodology,
};

export default adapter;
