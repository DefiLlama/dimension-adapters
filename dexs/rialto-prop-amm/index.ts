import { getProvider } from "@defillama/sdk";
import { getCreateAddress } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// Verified Robinhood deployment and event definitions:
// https://robinhoodchain.blockscout.com/address/0xC94135b63772b91D79d0A2DaAb2a8801f32359bD
const RIALTO_ROUTERS = [
  '0xC94135b63772b91D79d0A2DaAb2a8801f32359bD',
  '0xb63cEcf4Aa3F0E31bD58496b2487e9CE3521b8b3',
];

const routeActionEvent = 'event RouteActionExecuted( uint256 indexed hopIndex, uint8 kind, address indexed pool, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)';
// RouteActionKind.RawCall in the verified RialtoRouter deployment above.
const rawCallKind = 0n;
// Every PropAMM pair quotes against USDG.
const USDG = ADDRESSES.robinhood.USDG.toLowerCase();
const PAIR_DEPLOYERS = [
  '0xb97c121f7bf12bc21ed22b9739f3695bd2ab23a8',
  '0x8dbf0d37cad30b2510d5c74e0f87a210cb298086',
];

async function getPairAddresses(options: FetchOptions) {
  const provider = getProvider(options.chain);
  const pairs = new Set<string>();
  for (const deployer of PAIR_DEPLOYERS) {
    const nonce = await provider.getTransactionCount(deployer, 'latest');
    for (let n = 0; n < nonce; n++) pairs.add(getCreateAddress({ from: deployer, nonce: n }).toLowerCase());
  }
  return pairs;
}

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();

  const routeActionLogs = await options.getLogs({
    targets: RIALTO_ROUTERS,
    eventAbi: routeActionEvent,
  });

  const rawCallLogs = routeActionLogs.filter((log) => log.kind === rawCallKind);
  if (!rawCallLogs.length) return { dailyVolume };

  const propAmmPools = await getPairAddresses(options);

  for (const log of rawCallLogs) {
    if (!propAmmPools.has(log.pool.toLowerCase())) continue;
    if (log.tokenIn.toLowerCase() === USDG) dailyVolume.add(USDG, log.amountIn);
    else if (log.tokenOut.toLowerCase() === USDG) dailyVolume.add(USDG, log.amountOut);
    else dailyVolume.add(log.tokenIn, log.amountIn);
  }

  return {
    dailyVolume,
  }
}

const methodology = {
  Volume: "Volume of swaps Rialto routes through its PropAMM market-making pairs, valued by the USDG side of each swap (the input token if neither side is USDG).",
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
