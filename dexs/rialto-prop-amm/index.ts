import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const RIALTO_ROUTER = '0xC94135b63772b91D79d0A2DaAb2a8801f32359bD';

const routeActionEvent = 'event RouteActionExecuted( uint256 indexed hopIndex, uint8 kind, address indexed pool, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)';
const propAmmKind = 0n;

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();

  const routeActionLogs = await options.getLogs({
    target: RIALTO_ROUTER,
    eventAbi: routeActionEvent,
  });

  for (const log of routeActionLogs) {
    if (log.kind === propAmmKind) {
      dailyVolume.add(log.tokenIn, log.amountIn);
    }
  }

  return {
    dailyVolume,
  }
}

const methodology = {
  Volume: "Volume of all swaps on rialto prop amm, derived from rialto router logs where swap kind is prop amm(0).",
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-06-12",
  methodology,
}

export default adapter;