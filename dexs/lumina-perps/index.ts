import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// https://bscscan.com/address/0xd1581d1E0dE260F64054e9a77b18489b7c9bfa41 (SettlementRouter proxy)
const ROUTER = "0xd1581d1E0dE260F64054e9a77b18489b7c9bfa41";
// https://bscscan.com/address/0xf91b7467974692E5dB27D1a99Ab7cd6dc6356438 (LuminaLPVault proxy)
const LLP = "0xf91b7467974692E5dB27D1a99Ab7cd6dc6356438";
const USDT = ADDRESSES.bsc.USDT;
const openLockedAbi = "event OpenLocked(bytes32 indexed lockId, address indexed account, bytes32 indexed positionKey, uint256 openNonce, uint256 marginAmount, uint256 lpLockAmount)";
const assetsUnlockedAbi = "event AssetsUnlocked(address indexed account, uint256 amount)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const [openLogs, closeLogs] = await Promise.all([
    options.getLogs({ target: ROUTER, eventAbi: openLockedAbi }),
    options.getLogs({ target: LLP, eventAbi: assetsUnlockedAbi }),
  ]);
  for (const log of openLogs) dailyVolume.add(USDT, log.lpLockAmount);
  for (const log of closeLogs) dailyVolume.add(USDT, log.amount);
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
    Volume: "Notional (USDT) of perpetual positions opened, closed and liquidated. Opens are read from the settlement router's OpenLocked event, closes and liquidations from the size released in the LP vault's AssetsUnlocked event, valued at entry size.",
  },
};

export default adapter;
