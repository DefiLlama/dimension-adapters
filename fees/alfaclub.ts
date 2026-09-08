// AlfaClub (https://alfaclub.app) — SoFi key trading on Base.
// TVL already listed: https://defillama.com/protocol/alfaclub
//
// Fees are exclusive of bonding-curve price (fee = price * bps / 10000):
// buyers pay price + fees, sellers receive price - fees. This adapter reads
// paid amounts from events / treasury transfers and does not hardcode bps.
// Live rates live on FriendRoomManager and can change (caps 25% trade / 40% perf):
//   getSocialFees()      — currently 200 platform + 200 creator
//                          (docs wrongly say 5% / 2.5+2.5)
//   getTradingFees()     — currently 200 platform + 200 creator + 600 pool
//   getPerformanceFees() — currently 500 platform + 1500 creator of (balance - bridgeFee)
//
// v1 does not count performance / $3 bridgeFee on FriendStake clones.
// FriendStake 0x53BdEfB3E2faEB90b766B459AF96F3E357D3c3f9 is a beacon; each
// Trading room has its own clone. Targeting clones without noTarget getLogs is
// possible via FriendKey KeyCreated.stakingPool, but a recent 27h window had
// 0 DistributeFeeSent events. Key-trade fees are the live path.
// Launchpad (room tokens) is not included. Staker payouts are not fees.

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

const FRIEND_KEY = "0xAF0Bf8593dC6CA973DF2132731B0F9B5F974FA9F";
const FRIEND_POOL = "0xa1bf9bb17C283CF17F01516f78f3127D2C84C79d";
// Platform treasury / dev fee destination (FriendRoomManager).
const TREASURY = "0x953832A125B091cC8C99f90d2f7DaB79e8326076";

const CREATOR_REWARDED =
  "event CreatorRewarded(uint256 indexed tokenId, address indexed creator, uint256 amount)";
const FUNDS_PULLED =
  "event FundsPulled(uint256 indexed tokenId, uint256 amount, uint256 totalReserves)";
const FUNDS_DISPATCHED =
  "event FundsDispatched(uint256 indexed tokenId, uint256 amount, uint256 netAmount, bytes32 orderId)";
const TRANSFER =
  "event Transfer(address indexed from, address indexed to, uint256 value)";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const pad32 = (addr: string) =>
  "0x" + addr.replace(/^0x/i, "").toLowerCase().padStart(64, "0");

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs } = options;

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const [creatorLogs, poolLogs, dispatchLogs, protocolTransfers] = await Promise.all([
    getLogs({ target: FRIEND_KEY, eventAbi: CREATOR_REWARDED }),
    getLogs({ target: FRIEND_POOL, eventAbi: FUNDS_PULLED }),
    getLogs({ target: FRIEND_POOL, eventAbi: FUNDS_DISPATCHED }),
    getLogs({
      target: ADDRESSES.base.USDC,
      eventAbi: TRANSFER,
      topics: [TRANSFER_TOPIC, pad32(FRIEND_KEY), pad32(TREASURY)],
    }),
  ]);

  for (const log of creatorLogs) {
    dailyFees.add(ADDRESSES.base.USDC, log.amount, "Creator Fees");
    dailySupplySideRevenue.add(ADDRESSES.base.USDC, log.amount, "Creator Fees");
  }

  for (const log of poolLogs) {
    dailyFees.add(ADDRESSES.base.USDC, log.amount, "Trading Fund Fees");
    dailySupplySideRevenue.add(ADDRESSES.base.USDC, log.amount, "Trading Fund Fees");
  }

  for (const log of protocolTransfers) {
    dailyFees.add(ADDRESSES.base.USDC, log.value, "Protocol Fees");
    dailyRevenue.add(ADDRESSES.base.USDC, log.value, "Protocol Fees");
  }

  for (const log of dispatchLogs) {
    const dispatchFee = BigInt(log.amount) - BigInt(log.netAmount);
    if (dispatchFee > 0n) {
      dailyFees.add(ADDRESSES.base.USDC, dispatchFee, "Dispatch Fees");
      dailyRevenue.add(ADDRESSES.base.USDC, dispatchFee, "Dispatch Fees");
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "All user-paid slices on key trades and fund dispatch: platform + creator + trading-fund + $3 dispatch. Exclusive of bonding-curve price. Performance / bridge fees on FriendStake clones are not counted in v1 (beacon clones; 0 recent distributions).",
  Revenue: "Platform slices of key-trade fees plus flat dispatch fees paid to the protocol treasury.",
  ProtocolRevenue: "Same as Revenue — platform key-trade fees and dispatch fees to treasury.",
  SupplySideRevenue: "Creator rewards plus the trading-fund pull. Staker payouts are not fees.",
};

const breakdownMethodology = {
  Fees: {
    "Creator Fees": "CreatorRewarded amounts on FriendKey (creator slice of social/trading key-trade fees).",
    "Trading Fund Fees": "FundsPulled amounts on FriendPool (trading-fund slice of trading-room key trades).",
    "Protocol Fees": "USDC transferred from FriendKey to the platform treasury (platform slice of key-trade fees).",
    "Dispatch Fees": "FundsDispatched amount - netAmount on FriendPool (flat $3 dispatch fee to treasury).",
  },
  Revenue: {
    "Protocol Fees": "USDC transferred from FriendKey to the platform treasury.",
    "Dispatch Fees": "Flat dispatch fee (amount - netAmount) paid to treasury on fund dispatch.",
  },
  ProtocolRevenue: {
    "Protocol Fees": "USDC transferred from FriendKey to the platform treasury.",
    "Dispatch Fees": "Flat dispatch fee (amount - netAmount) paid to treasury on fund dispatch.",
  },
  SupplySideRevenue: {
    "Creator Fees": "CreatorRewarded amounts paid to key creators.",
    "Trading Fund Fees": "FundsPulled amounts added to the trading-room fund.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  methodology,
  breakdownMethodology,
  chains: [CHAIN.BASE],
  // FriendKey ERC1967 proxy deploy on Base: tx 0x7c4b9187c57f3e7bc6ede37fb7c95eb0f1d2decef506b1458b0db4b1753c5ada
  // block 40407107, 2026-01-05 08:59:21 UTC (Base Blockscout).
  start: "2026-01-05",
};

export default adapter;
