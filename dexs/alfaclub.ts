// AlfaClub key-trade volume on Base.
// Trade.tokenAmount is bonding-curve notional (exclusive of fees), not a fee field.
// Fees/revenue live in fees/alfaclub.ts. Launchpad volume is not included.

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

const FRIEND_KEY = "0xAF0Bf8593dC6CA973DF2132731B0F9B5F974FA9F";
const TRADE =
  "event Trade(uint256 indexed tokenId, address indexed trader, address indexed subject, bool isBuy, uint256 shareAmount, uint256 tokenAmount, uint256 supply)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const tradeLogs = await options.getLogs({
    target: FRIEND_KEY,
    eventAbi: TRADE,
  });
  for (const log of tradeLogs) {
    dailyVolume.add(ADDRESSES.base.USDC, log.tokenAmount);
  }
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  // FriendKey ERC1967 proxy deploy on Base: tx 0x7c4b9187c57f3e7bc6ede37fb7c95eb0f1d2decef506b1458b0db4b1753c5ada
  // block 40407107, 2026-01-05 08:59:21 UTC (Base Blockscout).
  start: "2026-01-05",
  methodology: {
    Volume: "Bonding-curve notional of every FriendKey Trade (tokenAmount). Fees are exclusive of this price and are tracked in fees/alfaclub.ts. Launchpad volume is not included.",
  },
};

export default adapter;
