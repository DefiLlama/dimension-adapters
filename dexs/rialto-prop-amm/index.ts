import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Verified Robinhood deployment and event definitions:
// https://robinhoodchain.blockscout.com/address/0xC94135b63772b91D79d0A2DaAb2a8801f32359bD
const RIALTO_ROUTER = '0xC94135b63772b91D79d0A2DaAb2a8801f32359bD';

const routeActionEvent = 'event RouteActionExecuted( uint256 indexed hopIndex, uint8 kind, address indexed pool, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)';
// RouteActionKind.RawCall in the verified RialtoRouter deployment above.
const rawCallKind = 0n;
// PropAMM pair deployments on Robinhood Chain:
// https://robinhoodchain.blockscout.com/
const propAmmPools = new Set([
  '0x79ef2fd912e3a3b91851497017cc813f10456065',
  '0x5744e9c5165973ba5a332135477f3000c143f16f',
  '0x0bf53c3bf003fbbf879a8677a7407c8c2743b30a',
  '0xaeaf9874ee5fd4c08af1f70910638a4b97a78ab8',
  '0x95e4a408590e5ace8aab498ab0f9f4236f5162e5',
  '0x6af2cee71babfa22f9f55a16507cc4dc6369304b',
  '0x894b9322662f4e4ce05882f38095c6c7bcf1cc73',
  '0x6222789510dcf233c98193107ff614a423fef6f3',
  '0x2d96272951b4c340a40b9aee6cd0fbb87f7bb51a',
  '0xe4c442a44b8ae699c95d313b2c407e4413ebe567',
  '0x7b301700047d789667782baa866468ab655d1153',
  '0x09751decf6e92ae76b5ee30d63ef752a27b85285',
  '0x9fd0d75285c4ee7fa70537b1e18fe265a944a227',
  '0xcd3d6b36f79ef74785bd1da226c9827b5a5c2dd8',
  '0x89e211d43bbcf8ca5eaa9e5fbdef078cf520ecf1',
  '0xdd479e2b6b114d23fd29e708da665678c1077c97',
  '0x000c9f312abc95b680fcbf23767a2e64ba438771',
  '0x28691a561d0e1d6a2661dee41b75d3b688fc4479',
  '0x769961bbed892f4178a39e5130352b5dddb5e955',
  '0xa0b134ca24006b4408d762fab13e40f3353f49c4',
  '0xe0db060b92de9094b9a49e1e82ca5f11dcb50a46',
  '0x85810a92d755feeb84afedd58ed4558910be3b43',
  '0x998dffa31c0f5ae43b23fd9e62b0d623d022ddae',
  '0xd8038a498ac03bae715d1c12f755f4d6730d364a',
  '0xf57584c4e372052fcf48e2a3942b9c1087f011ad',
  '0x0217ee258081bb431f9fa25e0943628ce9d0595a',
  '0xfc757a2c43c79146201aa5155322c82d7c7300c7',
]);

/** Returns volume executed against known PropAMM pair contracts. */
async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();

  const routeActionLogs = await options.getLogs({
    target: RIALTO_ROUTER,
    eventAbi: routeActionEvent,
  });

  for (const log of routeActionLogs) {
    if (log.kind === rawCallKind && propAmmPools.has(log.pool.toLowerCase())) {
      dailyVolume.add(log.tokenIn, log.amountIn);
    }
  }

  return {
    dailyVolume,
  }
}

const methodology = {
  Volume: "Volume executed against known PropAMM pairs.",
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
