// Lumina Perps (BNB Chain) - volume read only from the settlement router's on-chain event, no API.
// Volume = notional of positions OPENED: SettlementRouter.OpenLocked.lpLockAmount, which equals the
// position size in USDT since the router upgrade of 2026-11-13. Each position is one trader against
// the LP vault, so there is no maker/taker double count.
// Close notional is not emitted on-chain and is NOT reported, so this understates total traded volume.
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// https://bscscan.com/address/0xd1581d1E0dE260F64054e9a77b18489b7c9bfa41 (SettlementRouter proxy)
const ROUTER = "0xd1581d1E0dE260F64054e9a77b18489b7c9bfa41";
const USDT = ADDRESSES.bsc.USDT;
const openLockedAbi = "event OpenLocked(bytes32 indexed lockId, address indexed account, bytes32 indexed positionKey, uint256 openNonce, uint256 marginAmount, uint256 lpLockAmount)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const logs = await options.getLogs({ targets: [ROUTER], eventAbi: openLockedAbi });
  for (const log of logs) dailyVolume.add(USDT, log.lpLockAmount);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BSC],
  // first full UTC day after the router upgrade that made lpLockAmount equal to position size (2026-11-13 06:59 UTC)
  start: "2026-11-14",
  methodology: {
    Volume: "Notional (USDT) of perpetual positions opened, from the settlement router's OpenLocked event. Closing volume is not emitted on-chain and is not included.",
  },
};

export default adapter;
