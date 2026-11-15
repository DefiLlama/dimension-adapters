import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Verified Robinhood deployment and event definitions:
// https://robinhoodchain.blockscout.com/address/0xC94135b63772b91D79d0A2DaAb2a8801f32359bD
const RIALTO_ROUTERS = [
  '0xC94135b63772b91D79d0A2DaAb2a8801f32359bD',
  '0xb63cEcf4Aa3F0E31bD58496b2487e9CE3521b8b3',
];

const routeActionEvent = 'event RouteActionExecuted( uint256 indexed hopIndex, uint8 kind, address indexed pool, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)';
// RouteActionKind.RawCall in the verified RialtoRouter deployment above.
const rawCallKind = 0n;
// PropAMM pairs are deployed directly by 0x8dbf0d37cad30b2510d5c74e0f87a210cb298086, with no factory or
// registry event, and get redeployed (the 2026-11-06 set replaced every earlier pair). Every pair exposes
// traderVault(), so a RawCall target counts as PropAMM when it returns one of these vaults:
// 0x9c76... for the first pair (0x79ef2fd912e3a3b91851497017cc813f10456065), 0x2f45... for all later ones.
// The pair set is discovered per window; this vault set is still static and needs a new entry if the vault rotates.
const traderVaultAbi = 'function traderVault() view returns (address)';
const propAmmTraderVaults = new Set([
  '0x9c7633410deace3e8a1f891ba72541691e4252b2',
  '0x2f4579ca81717d3d61bf8b6f06571877bbe54a07',
]);
// Known pair, always probed: with permitFailure a failed RPC call looks like a non-PropAMM target, so a
// probe that does not resolve to a known vault means the lookup itself failed. It was deployed at
// 2026-06-15 13:51:08 UTC (block 58159), so earlier windows skip the check.
const probePool = '0x79ef2fd912e3a3b91851497017cc813f10456065';
const probePoolDeployedAt = 1781531468;

/** Returns volume executed against PropAMM pair contracts. */
async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();

  const routeActionLogs = await options.getLogs({
    targets: RIALTO_ROUTERS,
    eventAbi: routeActionEvent,
  });

  const rawCallLogs = routeActionLogs.filter((log) => log.kind === rawCallKind);
  if (!rawCallLogs.length) return { dailyVolume };

  const pools = [...new Set([probePool, ...rawCallLogs.map((log) => log.pool.toLowerCase())])];
  // RawCall also targets contracts without traderVault(), those calls revert. A failed multicall chunk comes
  // back as all-null outputs, so retry once before giving up.
  const lookupVaults = () => options.api.multiCall({ abi: traderVaultAbi, calls: pools, permitFailure: true });
  let vaults = await lookupVaults();
  const probeResolved = () => options.endTimestamp <= probePoolDeployedAt || propAmmTraderVaults.has(vaults[0]?.toLowerCase());
  if (!probeResolved()) vaults = await lookupVaults();
  if (!probeResolved()) throw new Error('rialto-prop-amm: traderVault() lookup failed for the probe pair');

  const propAmmPools = new Set(pools.filter((_, i) => propAmmTraderVaults.has(vaults[i]?.toLowerCase())));

  for (const log of rawCallLogs) {
    if (propAmmPools.has(log.pool.toLowerCase())) {
      dailyVolume.add(log.tokenIn, log.amountIn);
    }
  }

  return {
    dailyVolume,
  }
}

const methodology = {
  Volume: "Volume of swaps Rialto routes through its PropAMM market-making pairs.",
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
