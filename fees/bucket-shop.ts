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
// 1. The protocol's own BUCKET/ETH Uniswap v4 pool. TWO components per swap:
//    the 1% LP fee (liquidity is protocol-owned and permanently locked, so
//    LP fees are protocol income) PLUS the BucketFeeHook's 3% ETH fee
//    credited straight to the Treasury -- FEE_BPS() == 300 is a constant on
//    the verified hook at 0x11aFe0130450df7127276e7AF474Eccdf4D420Cc, and the
//    Treasury fee is the income stream that funds holder payouts. Both are
//    measured on |amount0| (the ETH leg), which keeps every swap denominated
//    in ETH regardless of direction; BUCKET-input trades are measured on
//    their ETH output leg, understating by ~fee^2 -- accepted for exact
//    pricing.
//
// 2. The Stockback router (0.5% fee on the input of any swap routed through
//    it, capped at 1% in the contract). The router's Swapped event carries the
//    exact fee in the input currency. Half of every router fee is credited
//    back to the trader as stock rewards ("Stockback"), so that half is
//    supply-side; the other half is protocol revenue.
//
// Allocation: the hook's Treasury fee and the protocol half of router fees
// fund the payout engine and are distributed to BUCKET holders as tokenized
// stocks (HoldersRevenue). The 1% LP fee accrues to the protocol's
// permanently locked liquidity position (ProtocolRevenue). A small share of
// holder revenue pays keeper gas for the on-chain deliveries; it varies with
// chain conditions and is not modeled as a fixed percentage.

// https://robinhoodchain.blockscout.com/address/0x8366a39CC670B4001A1121B8F6A443A643e40951
const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
// The protocol's BUCKET/ETH pool (currency0 = native ETH, fee = 10000 = 1%),
// created in the token's deployment transaction window at block 30506396.
const BUCKET_POOL_ID = "0x8857c1a180b5483c98d38f4d62db5866de2f91b737513347283f55e446424ce3";
// https://robinhoodchain.blockscout.com/address/0xbAE74d90D874943674C9aB7F9392601A06F544C2
const STOCKBACK_ROUTER = "0xbAE74d90D874943674C9aB7F9392601A06F544C2";

// BucketFeeHook.FEE_BPS() == 300, constant, verified source
const HOOK_FEE_BPS = 300n;

const SWAP_EVENT =
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
const SWAPPED_EVENT =
  "event Swapped(address indexed trader, address indexed to, address indexed currencyIn, uint256 amountIn, uint256 fee, uint256 amountOut)";

const abs = (n: bigint) => (n < 0n ? -n : n);

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
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
    const lpFeeWei = (ethLeg * BigInt(log.fee)) / 1_000_000n;
    const hookFeeWei = (ethLeg * HOOK_FEE_BPS) / 10_000n;
    dailyFees.add(nullAddress, lpFeeWei + hookFeeWei);
    dailyRevenue.add(nullAddress, lpFeeWei + hookFeeWei);
    dailyProtocolRevenue.add(nullAddress, lpFeeWei);     // locked protocol LP
    dailyHoldersRevenue.add(nullAddress, hookFeeWei);    // Treasury -> payouts
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
    dailyHoldersRevenue.add(token, fee / 2n);
    dailySupplySideRevenue.add(token, fee - fee / 2n);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Swap fees paid by traders on the protocol's BUCKET/ETH Uniswap v4 pool: the 1% LP fee plus the BucketFeeHook's 3% Treasury fee (FEE_BPS is a verified on-chain constant), both measured on the ETH leg of each Swap event; plus the Stockback router's 0.5% input fee (exact per-swap amount from its Swapped event).",
  UserFees: "Same as Fees; traders pay all three components.",
  Revenue: "The hook's 3% Treasury fee, the 1% LP fee (the pool's liquidity is protocol-owned and permanently locked), and the protocol half of Stockback router fees.",
  ProtocolRevenue: "The 1% LP fee, accruing to the protocol's permanently locked liquidity position.",
  HoldersRevenue: "The hook's 3% Treasury fee plus the protocol half of router fees: this is the stream the payout engine converts into tokenized stocks delivered to BUCKET holder wallets. Keeper gas for those deliveries is paid from this stream and varies with chain conditions; it is not modeled as a fixed split.",
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
