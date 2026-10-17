import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// TeleSwap moves BTC between Bitcoin and EVM chains as teleBTC; only the EVM side emits events, so this is a one-sided
// bridge (destination chain Bitcoin, attributed server-side). Same routers and events as dexs/teleswap:
// - incoming (BTC arriving as teleBTC): NewWrap on the transfer router, NewWrapAndSwap / NewWrapAndSwapV2 on the exchange
//   router (wrapped, then swapped), counted at the wrapped teleBTC amount
// - outgoing (back to Bitcoin): NewUnwrap on the burn router, counted in the token the user burned or swapped from
// Wrap-and-swaps that continue to Ethereum, Arbitrum, Base or Optimism through another bridge are counted here on the
// chain with TeleSwap's routers. The old adapter read api.teleportdao.xyz, which returns 403 (Cloudflare) since 2026-09.
const NEW_WRAP = "event NewWrap(bytes32 bitcoinTxId, bytes indexed lockerLockingScript, address lockerTargetAddress, address indexed user, address teleporter, uint256[2] amounts, uint256[4] fees, uint256 thirdPartyId, uint256 destinationChainId)";
const NEW_WRAP_AND_SWAP = "event NewWrapAndSwap(address lockerTargetAddress, address indexed user, address[2] inputAndOutputToken, uint256[2] inputAndOutputAmount, uint256 indexed speed, address indexed teleporter, bytes32 bitcoinTxId, uint256 appId, uint256 thirdPartyId, uint256[5] fees, uint256 destinationChainId)";
const NEW_WRAP_AND_SWAP_V2 = "event NewWrapAndSwapV2(address lockerTargetAddress, bytes32 indexed user, bytes32[3] inputIntermediaryOutputToken, uint256[3] inputIntermediaryOutputAmount, uint256 indexed speed, address indexed teleporter, bytes32 bitcoinTxId, uint256 appId, uint256 thirdPartyId, uint256[5] fees, uint256 destinationChainId)";
const NEW_UNWRAP = "event NewUnwrap(bytes userScript, uint8 scriptType, address lockerTargetAddress, address indexed userTargetAddress, uint256 requestIdOfLocker, uint256 indexed deadline, uint256 thirdPartyId, address inputToken, uint256[3] amounts, uint256[4] fees)";

const chainConfig: Record<string, { burnRouter: string; exchangeRouter: string; transferRouter: string; teleBTC: string }> = {
  [CHAIN.POLYGON]: {
    burnRouter: "0x0009876C47F6b2f0BCB41eb9729736757486c75f",
    exchangeRouter: "0xD1E9Ff33EC28f9Dd8D99E685a2B0F29dCaa095a3",
    transferRouter: "0x04367D74332137908BEF9acc0Ab00a299A823707",
    teleBTC: "0x3BF668Fe1ec79a84cA8481CEAD5dbb30d61cC685",
  },
  [CHAIN.BSC]: {
    burnRouter: "0x2787D48e0B74125597DD479978a5DE09Bb9a3C15",
    exchangeRouter: "0xcA5416364720c7324A547d39b1db496A2DCd4F0D",
    transferRouter: "0xA38aD0d52B89C20c2229E916358D2CeB45BeC5FF",
    teleBTC: "0xC58C1117DA964aEbe91fEF88f6f5703e79bdA574",
  },
  // BOB and BSquared routers (see dexs/teleswap) are not listed: no volume ever in the old bridges API, none on-chain in Sep–Oct 2026
};

const fetch = async (options: FetchOptions) => {
  const { burnRouter, exchangeRouter, transferRouter, teleBTC } = chainConfig[options.chain];
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();

  const wraps = await options.getLogs({ target: transferRouter, eventAbi: NEW_WRAP });
  const wrapAndSwaps = await options.getLogs({ target: exchangeRouter, eventAbi: NEW_WRAP_AND_SWAP });
  const wrapAndSwapsV2 = await options.getLogs({ target: exchangeRouter, eventAbi: NEW_WRAP_AND_SWAP_V2 });
  const unwraps = await options.getLogs({ target: burnRouter, eventAbi: NEW_UNWRAP });

  for (const l of wraps) dailyIncomingVolume.add(teleBTC, l.amounts[0]);
  for (const l of wrapAndSwaps) dailyIncomingVolume.add(teleBTC, l.inputAndOutputAmount[0]);
  for (const l of wrapAndSwapsV2) dailyIncomingVolume.add(teleBTC, l.inputIntermediaryOutputAmount[0]);
  for (const l of unwraps) dailyOutgoingVolume.add(l.inputToken, l.amounts[0]);

  return {
    dailyOutgoingVolume,
    dailyIncomingVolume,
    dailyOutgoingTxCount: unwraps.length,
    dailyIncomingTxCount: wraps.length + wrapAndSwaps.length + wrapAndSwapsV2.length,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: Object.keys(chainConfig),
  methodology: {
    OutgoingVolume: "Value of teleBTC (or tokens swapped into it) burned on each chain to withdraw BTC to Bitcoin.",
    IncomingVolume: "Value of BTC arriving on each chain as teleBTC, including BTC wrapped and then swapped into another token.",
    OutgoingTxCount: "Number of unwrap requests to Bitcoin on each chain.",
    IncomingTxCount: "Number of BTC wraps (with or without a swap) on each chain.",
  },
};

export default adapter;
