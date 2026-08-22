import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const RIALTO_ROUTER = '0xC94135b63772b91D79d0A2DaAb2a8801f32359bD';

const routeActionEvent = 'event RouteActionExecuted(uint256 indexed hopIndex, uint8 kind, address indexed pool, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)';
const feeChargedEvent = 'event FeeCharged(address indexed token, address indexed recipient, uint256 amount, uint16 bps, bytes32 integratorId)';

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const routeActionLogs = await options.getLogs({
    target: RIALTO_ROUTER,
    eventAbi: routeActionEvent,
  });

  const feeChargedLogs = await options.getLogs({
    target: RIALTO_ROUTER,
    eventAbi: feeChargedEvent,
  });

  for (const log of routeActionLogs) {
    dailyVolume.add(log.tokenIn, log.amountIn);
  }

  for (const log of feeChargedLogs) {
    dailyFees.add(log.token, Number(log.amount), "Platform Fees");
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const methodology = {
  Volume: "Volume of all swaps routed through Rialto router.",
  Fees: "5-10 BPs of platform fees charged on all swaps.",
  Revenue: "5-10 BPs of platform fees charged on all swaps.",
  ProtocolRevenue: "5-10 BPs of platform fees charged on all swaps.",
}

const breakdownMethodology = {
  Fees: {
    "Platform Fees": "5-10 BPs of platform fees charged on all swaps.",
  },
  Revenue: {
    "Platform Fees": "5-10 BPs of platform fees charged on all swaps.",
  },
  ProtocolRevenue: {
    "Platform Fees": "5-10 BPs of platform fees charged on all swaps.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-06-12",
  methodology,
  breakdownMethodology,
}

export default adapter;