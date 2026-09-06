import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { nullAddress } from "../helpers/token";

// Bucket Shop — fees & revenue adapter.
//
// Bucket Shop (https://bucketmarkets.com) pays BUCKET holders in real
// tokenized equities on Robinhood Chain: protocol fee income buys stocks and
// the payout engine delivers them straight to holder wallets once a holder's
// accrual crosses $2. Nothing is retained by a team treasury, which is why
// ProtocolRevenue is zero and HoldersRevenue equals Revenue below.
//
// Two fee streams, both read from chain:
//
// 1. The protocol's own BUCKET/ETH Uniswap v4 pool (1% LP fee, protocol fee
//    hook). Its liquidity is protocol-owned and permanently locked (added via
//    a donate conduit with no withdrawal path), so the pool's LP fees are
//    protocol income. Fees are computed per Swap event as |amount0| (the ETH
//    leg) x fee/1e6, which keeps every swap denominated in ETH regardless of
//    trade direction. Trades where BUCKET is the input are therefore measured
//    on their ETH output leg, understating that swap's fee by fee^2 (about
//    0.01% of the fee) -- accepted for the benefit of exact pricing.
//
// 2. The Stockback router (0.5% fee on the input of any swap routed through
//    it, capped at 1% in the contract). The router's Swapped event carries the
//    exact fee in the input currency. Half of every router fee is credited
//    back to the trader as stock rewards ("Stockback"), so that half is
//    supply-side; the other half is protocol revenue.
//
// All protocol fee income (pool fees + the protocol half of router fees) is
// distributed to BUCKET holders as tokenized stocks by the payout engine, so
// HoldersRevenue == Revenue. A small share of revenue pays keeper gas for the
// on-chain deliveries; it is not deducted here.

// https://robinhoodchain.blockscout.com/address/0x8366a39CC670B4001A1121B8F6A443A643e40951
const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
// The protocol's BUCKET/ETH pool (currency0 = native ETH, fee = 10000 = 1%),
// created in the token's deployment transaction window at block 30506396.
const BUCKET_POOL_ID = "0x8857c1a180b5483c98d38f4d62db5866de2f91b737513347283f55e446424ce3";
// https://robinhoodchain.blockscout.com/address/0xbAE74d90D874943674C9aB7F9392601A06F544C2
const STOCKBACK_ROUTER = "0xbAE74d90D874943674C9aB7F9392601A06F544C2";

const SWAP_EVENT =
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
const SWAPPED_EVENT =
  "event Swapped(address indexed trader, address indexed to, address indexed currencyIn, uint256 amountIn, uint256 fee, uint256 amountOut)";

const abs = (n: bigint) => (n < 0n ? -n : n);

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // 1. LP fees on the protocol-owned BUCKET/ETH pool, in ETH terms
  const swaps = await options.getLogs({
    target: POOL_MANAGER,
    eventAbi: SWAP_EVENT,
    topics: [
      "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f", // Swap
      BUCKET_POOL_ID,
    ],
  });
  for (const log of swaps) {
    const ethLeg = abs(BigInt(log.amount0));
    const feeWei = (ethLeg * BigInt(log.fee)) / 1_000_000n;
    dailyFees.add(nullAddress, feeWei);
    dailyRevenue.add(nullAddress, feeWei);
  }

  // 2. Stockback router fees, exact per-swap fee in the input currency;
  //    half is protocol revenue, half is the trader's Stockback rebate
  const routed = await options.getLogs({
    target: STOCKBACK_ROUTER,
    eventAbi: SWAPPED_EVENT,
  });
  for (const log of routed) {
    const fee = BigInt(log.fee);
    const token = log.currencyIn === "0x0000000000000000000000000000000000000000"
      ? nullAddress
      : log.currencyIn;
    dailyFees.add(token, fee);
    dailyRevenue.add(token, fee / 2n);
    dailySupplySideRevenue.add(token, fee - fee / 2n);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Swap fees paid by traders: the 1% LP fee on the protocol-owned BUCKET/ETH Uniswap v4 pool (per Swap event, measured on the ETH leg) plus the Stockback router's 0.5% fee on the input of every swap routed through it (exact per-swap fee from the router's Swapped event).",
  UserFees: "Same as Fees; traders pay both fee streams.",
  Revenue: "Pool LP fees (the pool's liquidity is protocol-owned and permanently locked) plus the protocol half of Stockback router fees.",
  ProtocolRevenue: "Zero. No fee income is retained by a team treasury; everything flows to the payout engine.",
  HoldersRevenue: "Equal to Revenue: all protocol fee income buys tokenized stocks that the payout engine delivers to BUCKET holder wallets. A small share pays keeper gas for those on-chain deliveries and is not deducted here.",
  SupplySideRevenue: "The trader's half of every Stockback router fee, credited back as stock rewards.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-08-07", // BUCKET/ETH pool initialized, block 30506396
  methodology,
};

export default adapter;
