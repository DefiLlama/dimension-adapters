import { ethers } from "ethers";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import ADDRESSES from "../helpers/coreAssets.json";

// Lockcurve - a coin launchpad on Base. A coin trades on a bonding curve priced in USDC; once the curve raises its
// graduation target, the USDC and the rest of the supply open a Uniswap v4 pool whose liquidity no one can withdraw.
// Every trade pays 1%, on the curve and in the pool, split 70% to the coin's creator and 30% to the treasury (a
// 2-of-3 Safe). Creating a coin pays a flat launch fee in USDC to the treasury.
//
// https://lockcurve.xyz - every contract is verified on BaseScan.

// https://basescan.org/address/0x8A8A23C2944A12eBE9043Bf924d4B3c8Bdb79D0E#code
const FACTORY = "0x8a8a23c2944a12ebe9043bf924d4b3c8bdb79d0e";
// https://basescan.org/address/0x8E8Da7c4222a72e094Cf201DfD00F288FF8c5698#code (opens every graduated coin's pool)
const GRADUATE = "0x8e8da7c4222a72e094cf201dfd00f288ff8c5698";
// Uniswap v4 PoolManager on Base: https://basescan.org/address/0x498581fF718922c3f8e6A244956aF099B2652b2b
const POOL_MANAGER = "0x498581ff718922c3f8e6a244956af099b2652b2b";
// Block the factory was deployed in (2026-09-29): no launch, trade or pool predates it.
const FACTORY_FROM_BLOCK = 51936125;
const USDC = ADDRESSES.base.USDC;

// PadTypes.TRADE_FEE_BPS = 100 and PadTypes.CREATOR_FEE_BPS = 7000 in the verified source: 1% per trade, 70% of it
// to the creator and the rest to the treasury.
const TRADE_FEE = 0.01;
const CREATOR_SHARE = 0.7;

const LAUNCH_CREATED =
  "event LaunchCreated(address indexed curve, address indexed token, address indexed creator, string name, string symbol, string imageUri)";
const BOUGHT = "event Bought(address indexed buyer, address indexed receiver, uint256 quoteIn, uint256 fee, uint256 tokensOut)";
const SOLD = "event Sold(address indexed seller, address indexed receiver, uint256 tokensIn, uint256 fee, uint256 quoteOut)";
const POOL_OPENED = "event PoolOpened(address indexed launch, bytes32 indexed poolId, uint160 sqrtPriceX96, uint128 liquidityLocked)";
const SWAP =
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
const TRANSFER = "event Transfer(address indexed from, address indexed to, uint256 value)";

const LABEL = {
  curve: "Bonding Curve Trading Fees",
  pool: "Uniswap v4 Pool Swap Fees",
  launch: "Launch Fees",
  curveToCreators: "Bonding Curve Trading Fees To Creators",
  poolToCreators: "Pool Swap Fees To Creators",
  curveToTreasury: "Bonding Curve Trading Fees To Treasury",
  poolToTreasury: "Pool Swap Fees To Treasury",
  launchToTreasury: "Launch Fees To Treasury",
};

const topicOf = (address: string) => ethers.zeroPadValue(address.toLowerCase(), 32);
const abs = (v: bigint) => (v < 0n ? -v : v);

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const addTradeFee = (fee: bigint, source: string, toCreators: string, toTreasury: string) => {
    // The creator is paid first and the treasury takes the remainder (PadCurve._payFee, PadFeeHook._takeFee).
    const creator = (fee * BigInt(CREATOR_SHARE * 10_000)) / 10_000n;
    dailyFees.add(USDC, fee, source);
    dailySupplySideRevenue.add(USDC, creator, toCreators);
    dailyRevenue.add(USDC, fee - creator, toTreasury);
  };

  // Every coin ever launched, to know the curves and each coin's token.
  const launches = await options.getLogs({ target: FACTORY, eventAbi: LAUNCH_CREATED, fromBlock: FACTORY_FROM_BLOCK, cacheInCloud: true });
  const curves = launches.map((l: any) => String(l.curve).toLowerCase());
  const tokenOf: Record<string, string> = {};
  for (const l of launches) tokenOf[String(l.curve).toLowerCase()] = String(l.token).toLowerCase();

  // 1. The bonding curve: every Bought and Sold carries its exact fee, in USDC.
  if (curves.length) {
    const [bought, sold] = await Promise.all([
      options.getLogs({ targets: curves, eventAbi: BOUGHT, flatten: true }),
      options.getLogs({ targets: curves, eventAbi: SOLD, flatten: true }),
    ]);
    for (const log of [...bought, ...sold]) addTradeFee(BigInt(log.fee), LABEL.curve, LABEL.curveToCreators, LABEL.curveToTreasury);
  }

  // 2. Graduated coins trade in Uniswap v4 pools with Lockcurve's hook. The hook takes 1% of each swap's output: a
  //    sell pays it in USDC, a buy in the coin. Coins have no market outside these pools, so every swap's fee is
  //    booked on its USDC side, as 1% of the USDC that moved, which is the fee's value at the swap's own price.
  const opened = await options.getLogs({ target: GRADUATE, eventAbi: POOL_OPENED, fromBlock: FACTORY_FROM_BLOCK, cacheInCloud: true });
  const usdcIs0: Record<string, boolean> = {};
  for (const log of opened) {
    const token = tokenOf[String(log.launch).toLowerCase()];
    if (!token) throw new Error(`Lockcurve: pool ${log.poolId} opened for an unknown launch ${log.launch}`);
    // v4 sorts a pool's currencies by address.
    usdcIs0[String(log.poolId).toLowerCase()] = USDC.toLowerCase() < token;
  }
  const poolIds = Object.keys(usdcIs0);
  if (poolIds.length) {
    // eth_getLogs takes an array at a topic position as an OR filter: one query covers every Lockcurve pool.
    const swaps = await options.getLogs({
      target: POOL_MANAGER,
      eventAbi: SWAP,
      topics: [ethers.id("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)"), poolIds as unknown as string],
    });
    for (const log of swaps) {
      const is0 = usdcIs0[String(log.id).toLowerCase()];
      if (is0 === undefined) continue;
      const usdcMoved = abs(BigInt(is0 ? log.amount0 : log.amount1));
      addTradeFee((usdcMoved * BigInt(TRADE_FEE * 10_000)) / 10_000n, LABEL.pool, LABEL.poolToCreators, LABEL.poolToTreasury);
    }
  }

  // 3. The launch fee: the USDC the creator sends the treasury inside the launch transaction. Read from the transfer
  //    itself, so it follows the fee the Safe sets (PadFactory.setParams) without hardcoding it.
  const windowLaunches = await options.getLogs({ target: FACTORY, eventAbi: LAUNCH_CREATED, entireLog: true, parseLog: true });
  if (windowLaunches.length) {
    const treasury = await options.api.call({ target: FACTORY, abi: "address:treasury" });
    const launchTxs = new Set(windowLaunches.map((l: any) => String(l.transactionHash).toLowerCase()));
    const creators = [...new Set(windowLaunches.map((l: any) => topicOf(String(l.args.creator))))];
    const transfers = await options.getLogs({
      target: USDC,
      eventAbi: TRANSFER,
      topics: [ethers.id("Transfer(address,address,uint256)"), creators as unknown as string, topicOf(treasury)],
      entireLog: true,
      parseLog: true,
    });
    for (const log of transfers) {
      if (!launchTxs.has(String(log.transactionHash).toLowerCase())) continue;
      dailyFees.add(USDC, log.args.value, LABEL.launch);
      dailyRevenue.add(USDC, log.args.value, LABEL.launchToTreasury);
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
};

const methodology = {
  Fees: "1% of every trade on the bonding curve and in the graduated Uniswap v4 pools, plus the flat USDC fee paid to launch a coin.",
  Revenue: "30% of every trading fee and every launch fee, sent to the Lockcurve treasury.",
  ProtocolRevenue: "30% of every trading fee and every launch fee, sent to the Lockcurve treasury.",
  SupplySideRevenue: "70% of every trading fee, paid to the coin's creator.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.curve]: "1% of each buy and sell on a coin's bonding curve, read in USDC from the curve's Bought and Sold events.",
    [LABEL.pool]:
      "1% of each swap in a graduated coin's Uniswap v4 pool, taken by the Lockcurve hook and booked as 1% of the USDC side of the PoolManager's Swap event.",
    [LABEL.launch]: "The flat USDC fee a creator pays the treasury when launching a coin.",
  },
  Revenue: {
    [LABEL.curveToTreasury]: "30% of bonding curve trading fees, sent to the treasury.",
    [LABEL.poolToTreasury]: "30% of pool swap fees, sent to the treasury.",
    [LABEL.launchToTreasury]: "Launch fees, sent in full to the treasury.",
  },
  ProtocolRevenue: {
    [LABEL.curveToTreasury]: "30% of bonding curve trading fees, sent to the treasury.",
    [LABEL.poolToTreasury]: "30% of pool swap fees, sent to the treasury.",
    [LABEL.launchToTreasury]: "Launch fees, sent in full to the treasury.",
  },
  SupplySideRevenue: {
    [LABEL.curveToCreators]: "70% of bonding curve trading fees, paid to the coin's creator.",
    [LABEL.poolToCreators]: "70% of pool swap fees, paid to the coin's creator.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: "2026-09-29",
  methodology,
  breakdownMethodology,
};

export default adapter;
