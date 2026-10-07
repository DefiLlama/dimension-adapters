// AlfaClub V2 (https://alfaclub.app): social launchpad on Robinhood Chain. Creators run rooms with
// tradable ERC-1155 keys and can launch a room token into a Uniswap V3 USDG pool whose liquidity is
// locked forever. AlfaClub V1 on Base is the separate `alfaclub` listing (fees/alfaclub.ts).
//
// Every amount is read from the contracts' own events; no fee rate is hardcoded.
import ADDRESSES from "../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const USDG = ADDRESSES.robinhood.USDG; // 6 decimals, the only quote asset in AlfaClub V2

// Room-key market: platform and creator fees are charged on top of the key price on buys and sells.
// https://robinhoodchain.blockscout.com/address/0x64Fb2678cCe04A352a405eAa024eE02935f0ACb9
const ROOM_KEY = "0x64Fb2678cCe04A352a405eAa024eE02935f0ACb9";
// Launches room tokens; its only call into the fee router is the flat launch fee inside launch().
// https://robinhoodchain.blockscout.com/address/0xbCf4D837a18b1618BCA6263bA610eFF9A8677e95
const DIRECTOR = "0xbCf4D837a18b1618BCA6263bA610eFF9A8677e95";
// Splits room-token pool fees 50% keyholders / 35% creator / 15% platform. It only accepts a room's
// canonical fee collector, the splitter that owns the room's locked LP position.
// https://robinhoodchain.blockscout.com/address/0x1706BAA51679aeC74dB5E1507cf7Cc7591Db1770
const LAUNCH_FEE_ROUTER = "0x1706BAA51679aeC74dB5E1507cf7Cc7591Db1770";
// "AlfaClub Official", the room behind the ALFA token. Its creator is AlfaClub's own wallet
// 0x3099980fC2fa83a7be54C2315483CF70DE031707 (RoomKey.creatorOf; registered in tx
// 0x8212a46e0cfb2a8052d168aecdb12b9db76aa1b7acc3c3d37c3b6ed88fb3b778), so the creator share of its
// key and swap fees is protocol revenue rather than creator income.
const OFFICIAL_ROOM_ID = 40035824607104520286739138494982524780n;

const TRADE =
  "event Trade(uint256 indexed roomId, address indexed trader, bool isBuy, uint256 amount, uint256 price, uint256 platformFee, uint256 creatorFee, uint256 newSupply)";
const PLATFORM_CREDITED = "event PlatformCredited(address indexed source, uint256 amount)";
const DISTRIBUTED =
  "event Distributed(uint256 indexed roomId, address indexed source, address indexed creator, uint256 totalAmount, uint256 keyholderAmount, uint256 creatorGrossAmount, uint256 creatorCreditedAmount, uint256 creatorLiquidityAmount, uint256 zeroSupplyLiquidityAmount, uint256 platformAmount)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const trades = await options.getLogs({ target: ROOM_KEY, eventAbi: TRADE });
  for (const log of trades) {
    dailyFees.add(USDG, log.platformFee, "Key Trading Fees");
    dailyFees.add(USDG, log.creatorFee, "Key Trading Fees");
    dailyRevenue.add(USDG, log.platformFee, "Key Trading Fees To Protocol");
    if (BigInt(log.roomId) === OFFICIAL_ROOM_ID) dailyRevenue.add(USDG, log.creatorFee, "Key Trading Fees To Protocol");
    else dailySupplySideRevenue.add(USDG, log.creatorFee, "Key Trading Fees To Creators");
  }

  // The router also emits PlatformCredited for the platform share of every pool-fee distribution
  // (source = the room's splitter). That share is counted from Distributed below, so only the
  // Director's credits, which are launch fees, are taken here.
  const credits = await options.getLogs({ target: LAUNCH_FEE_ROUTER, eventAbi: PLATFORM_CREDITED });
  for (const log of credits) {
    if (log.source.toLowerCase() !== DIRECTOR.toLowerCase()) continue;
    dailyFees.add(USDG, log.amount, "Token Launch Fees");
    dailyRevenue.add(USDG, log.amount, "Token Launch Fees To Protocol");
  }

  // Pool fees are counted when the splitter collects them: the USDG side as is, the token side after
  // the splitter sells it for USDG. Fees earned by the creator's permanent-liquidity positions are
  // routed the same way.
  const distributions = await options.getLogs({ target: LAUNCH_FEE_ROUTER, eventAbi: DISTRIBUTED });
  for (const log of distributions) {
    dailyFees.add(USDG, log.totalAmount, METRIC.SWAP_FEES);
    dailyRevenue.add(USDG, log.platformAmount, "Token Swap Fees To Protocol");
    dailySupplySideRevenue.add(USDG, log.keyholderAmount, "Token Swap Fees To Keyholders");
    if (BigInt(log.roomId) === OFFICIAL_ROOM_ID) dailyRevenue.add(USDG, log.creatorCreditedAmount, "Token Swap Fees To Protocol");
    else dailySupplySideRevenue.add(USDG, log.creatorCreditedAmount, "Token Swap Fees To Creators");
    // Part of the creator's 35% that the creator committed to permanent liquidity at launch, plus the
    // keyholder share if a room ever had no keys (RoomKey makes that unreachable).
    dailySupplySideRevenue.add(USDG, log.creatorLiquidityAmount, "Token Swap Fees To Permanent Liquidity");
    dailySupplySideRevenue.add(USDG, log.zeroSupplyLiquidityAmount, "Token Swap Fees To Permanent Liquidity");
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Fees paid on room-key buys and sells, the flat fee to launch a room token, and swap fees earned by room-token liquidity. Excludes fees on Spot swaps routed through third-party aggregators.",
  Revenue: "AlfaClub's platform key-trading fee, room-token launch fees and 15% of room-token swap fees, plus the creator shares in AlfaClub's own room, the room behind the ALFA token.",
  ProtocolRevenue: "AlfaClub's platform key-trading fee, room-token launch fees and 15% of room-token swap fees, plus the creator shares in AlfaClub's own room, the room behind the ALFA token.",
  SupplySideRevenue: "Creator key-trading fees, plus 85% of room-token swap fees: 50% to the room's keyholders and 35% to the creator. Creator shares in AlfaClub's own room count as Revenue instead.",
};

const breakdownMethodology = {
  Fees: {
    "Key Trading Fees": "Platform and creator fees on room-key buys and sells, charged on top of the key price (currently 2% + 2%, unchanged since launch).",
    "Token Launch Fees": "Flat USDG fee paid to AlfaClub when a room token launches; AlfaClub pays the launch gas.",
    [METRIC.SWAP_FEES]: "1% Uniswap V3 LP fee earned by each room token's locked liquidity, counted in USDG when collected; token-side fees are sold for USDG first.",
  },
  Revenue: {
    "Key Trading Fees To Protocol": "Platform share of room-key trading fees, plus the creator share in AlfaClub's own room.",
    "Token Launch Fees To Protocol": "Room-token launch fees, kept by the platform.",
    "Token Swap Fees To Protocol": "15% of room-token swap fees, plus the creator's credited share of the ALFA pool (its 35% less any part committed to permanent liquidity), since AlfaClub created that room.",
  },
  ProtocolRevenue: {
    "Key Trading Fees To Protocol": "Platform share of room-key trading fees, plus the creator share in AlfaClub's own room.",
    "Token Launch Fees To Protocol": "Room-token launch fees, kept by the platform.",
    "Token Swap Fees To Protocol": "15% of room-token swap fees, plus the creator's credited share of the ALFA pool (its 35% less any part committed to permanent liquidity), since AlfaClub created that room.",
  },
  SupplySideRevenue: {
    "Key Trading Fees To Creators": "Creator share of room-key trading fees.",
    "Token Swap Fees To Keyholders": "50% of room-token swap fees, claimable by the room's keyholders.",
    "Token Swap Fees To Creators": "The creator's 35% of room-token swap fees, less any part committed to permanent liquidity.",
    "Token Swap Fees To Permanent Liquidity": "The part of the creator's 35% that the creator committed at launch to permanent liquidity for the room token.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  // First key trade and first launch fee: block 73861766 (tx 0x5aa00a4e20d4f94ca04b8e73036f20f4f26c46429d73154b17c7bf34c5898304)
  // and block 73877993 (tx 0x900f37981f1489b6d72afe4c3cc61855a5ea7fb29cf2d4c40bd179569cd79c9d), both 2026-09-27 UTC.
  start: "2026-09-27",
  methodology,
  breakdownMethodology,
  doublecounted: true, // uni v3
};

export default adapter;
