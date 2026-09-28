// outbidfun.lol — fees, revenue & volume adapter.
//
// outbidfun.lol (https://outbidfun.lol) is a token launchpad on Robinhood Chain (chainId 4663).
// Every coin is its own contract with its own bonding curve, priced in a reserve asset its
// creator picks from the ones the factory lists (WETH, USDG, tokenised shares). Coins are found
// from the factory's MemeCoinDeployed events. When a curve's reserve reaches its cap the coin
// graduates into the platform's own Uniswap V3 pool, where the CoinListingManager holds one
// full-range position it can never withdraw.
//
// Fee sources, all read from events:
//   - Curve trades. Each coin emits FeesCharged(by, fee, tax) in its reserve asset on every buy
//     and sell. `fee` is the trading fee (1%) plus any snipe tax on a buy in the first seconds
//     after launch; the coin's immutable `protocolShareBps` (30% at launch) of it goes to the
//     protocol, the rest to the creator. `tax` is the creator's own tax, paid to the creator in
//     full. The creator's side is credited to the FeeEscrow, or to the coin's holders for a
//     reward coin whose creator gave their fees away.
//   - Launches. The factory forwards the ETH launch fee (0.0005 ETH) to the protocol's
//     RevenueRouter, which logs it as RevenueReceived with the factory as source.
//   - Graduated pools. Every swap pays the pool's fee tier (read from PoolOpened), measured on the
//     quote-asset leg so it is always in a priced asset: on the input when the quote asset goes
//     in, and at the swap's own price, quoteOut * fee / (1 - fee), when the coin goes in. The
//     locked position earns its share of the pool's active liquidity (its liquidity, from
//     MemeCoinListed, over the Swap event's), split like the trading fee: `protocolShareBps` to the
//     protocol when CoinListingManager.collectFees sweeps it, the rest to the creator. Anything
//     left is earned by third-party LPs. The factory's protocol fee switch stays off: its owner,
//     the CoinListingManager, has no way to turn it on. Swap volume is not counted.
//   - Front-page bids. Each bid in USDG is split on the spot (BidSettled): 20% to the $OUTBID
//     buyback vault and 5% to the treasury, which is protocol revenue. The other 75% buys the
//     bid-on coin and burns it. That purchase is a trade on the coin's curve (its volume and its
//     trading fee are counted above) rather than a fee, so it is not counted again here.
//
// All protocol revenue is ProtocolRevenue for now: 80% of what reaches the RevenueRouter (and
// the bids' 20%) accumulates in the OutbidBuyback vault to buy and burn $OUTBID, which has not
// launched yet. HoldersRevenue can come from the vault's BuybackExecuted events once it does.
//
// Volume is the reserve-asset leg of every curve trade, fees included: Buy/Sell `liquidity` is
// what reached the curve on a buy and what the seller received on a sell, after fees.
// Post-graduation swaps are the pool's volume, not the launchpad's.
//
// Not counted: a reward coin's transfer fee, which is a token tax paid in the launched coin.
import * as sdk from "@defillama/sdk";
import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// Robinhood Chain mainnet deployment, 27 September 2026. Source and addresses:
// https://github.com/outbidfun/outbidfun-contracts/blob/main/DEPLOYMENTS.md
// CoinFactory: https://robinhoodchain.blockscout.com/address/0xDadC43dbf60eA5d4598C39500Ede46De6A14c0d0
const FACTORY = "0xDadC43dbf60eA5d4598C39500Ede46De6A14c0d0";
// The block of the deployment's first transaction; nothing here emits before it.
const DEPLOY_BLOCK = 73821560;
// CoinListingManager, which opens every graduated coin's pool and owns the V3 factory:
// https://robinhoodchain.blockscout.com/address/0xcF4EEc2a27ff46f1dB10Ef6ce3a65704EF5997E4
const LISTING_MANAGER = "0xcF4EEc2a27ff46f1dB10Ef6ce3a65704EF5997E4";
// RevenueRouter, the listing manager's `treasury()`, where the launch fee is paid:
// https://robinhoodchain.blockscout.com/address/0xeEc171B409788644acBf1c50B825Cc6d9682D9b7
const REVENUE_ROUTER = "0xeEc171B409788644acBf1c50B825Cc6d9682D9b7";
// OutbidMarket: the first (frozen since 28 September 2026, its board moved to the second) and the
// current one. Both have history.
const OUTBID_MARKETS = ["0x1Eaca99186F58A258B08fd7A25524A20c31def63", "0xad7ca6bf8c0ab7793eBEC811Da5F54304383669A"];
// How RevenueRouter's RevenueReceived names native ETH.
const ETHER = "0x0000000000000000000000000000000000000000";
// Coin fee shares are in basis points.
const BPS = 10_000n;
// Uniswap V3 fee tiers are in hundredths of a basis point.
const FEE_DENOMINATOR = 1_000_000n;

const MEMECOIN_DEPLOYED = "event MemeCoinDeployed(address indexed creator, address indexed memecoin, address indexed quoteAsset)";
const BUY = "event Buy(address indexed by, uint256 amount, uint256 liquidity, uint256 newSupply, uint256 timestamp)";
const SELL = "event Sell(address indexed by, uint256 amount, uint256 liquidity, uint256 newSupply, uint256 timestamp)";
const FEES_CHARGED = "event FeesCharged(address indexed by, uint256 fee, uint256 tax)";
const REVENUE_RECEIVED = "event RevenueReceived(address indexed source, address indexed asset, uint256 amount)";
const POOL_OPENED = "event PoolOpened(address indexed coin, address indexed pool, address quote, uint24 fee, uint160 sqrtPriceX96)";
const MEMECOIN_LISTED =
  "event MemeCoinListed(address indexed memecoin, address indexed pool, address quote, uint128 liquidity, uint256 quoteIn, uint256 coinIn)";
const SWAP = "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)";
const BID_SETTLED =
  "event BidSettled(address indexed token, address indexed asset, uint256 burnSpent, uint256 coinsBurned, uint256 toBuyback, uint256 toTreasury)";

const LABELS = {
  tradingFees: METRIC.TRADING_FEES,
  creatorTax: "Creator Tax",
  launchFees: "Token Launch Fees",
  bidFees: "Front Page Bid Fees",
  swapFees: METRIC.SWAP_FEES,
  tradingToProtocol: "Trading Fees To Protocol",
  launchToProtocol: "Token Launch Fees To Protocol",
  bidsToProtocol: "Front Page Bid Fees To Protocol",
  swapToProtocol: "Token Swap Fees To Protocol",
  tradingToCreators: "Trading Fees To Creators",
  taxToCreators: "Creator Tax To Creators",
  swapToCreators: "Token Swap Fees To Creators",
  swapToLPs: "Token Swap Fees To LPs",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyVolume = options.createBalances();

  const launches = await options.getLogs({
    target: FACTORY,
    eventAbi: MEMECOIN_DEPLOYED,
    fromBlock: DEPLOY_BLOCK,
    cacheInCloud: true,
  });
  const coins: string[] = launches.map((launch: any) => launch.memecoin);
  // Immutable on each coin, so it is read at the latest block rather than the window's: the
  // chain's public RPC keeps no historical state.
  const latestApi = new sdk.ChainApi({ chain: options.chain });
  const shares: string[] = coins.length ? await latestApi.multiCall({ abi: "uint16:protocolShareBps", calls: coins }) : [];
  const shareOf = new Map(coins.map((coin, i) => [coin.toLowerCase(), BigInt(shares[i])]));

  if (coins.length) {
    const buys = await options.getLogs({ targets: coins, eventAbi: BUY, flatten: false });
    const sells = await options.getLogs({ targets: coins, eventAbi: SELL, flatten: false });
    const charges = await options.getLogs({ targets: coins, eventAbi: FEES_CHARGED, flatten: false });

    launches.forEach((launch: any, i: number) => {
      const reserve = launch.quoteAsset;
      const shareBps = shareOf.get(launch.memecoin.toLowerCase())!;
      for (const log of [...buys[i], ...sells[i]]) dailyVolume.add(reserve, log.liquidity);
      for (const log of charges[i]) {
        const fee = BigInt(log.fee);
        const tax = BigInt(log.tax);
        const toProtocol = (fee * shareBps) / BPS;
        dailyVolume.add(reserve, fee + tax);
        dailyFees.add(reserve, fee, LABELS.tradingFees);
        dailyFees.add(reserve, tax, LABELS.creatorTax);
        dailyRevenue.add(reserve, toProtocol, LABELS.tradingToProtocol);
        dailySupplySideRevenue.add(reserve, fee - toProtocol, LABELS.tradingToCreators);
        dailySupplySideRevenue.add(reserve, tax, LABELS.taxToCreators);
      }
    });
  }

  // Graduated pools: the fee tier from PoolOpened, the locked position's liquidity from
  // MemeCoinListed. Both are emitted once per pool, in the graduation transaction.
  const opened = await options.getLogs({ target: LISTING_MANAGER, eventAbi: POOL_OPENED, fromBlock: DEPLOY_BLOCK, cacheInCloud: true });
  const listed = await options.getLogs({ target: LISTING_MANAGER, eventAbi: MEMECOIN_LISTED, fromBlock: DEPLOY_BLOCK, cacheInCloud: true });
  const lockedOf = new Map(listed.map((log: any) => [log.pool.toLowerCase(), BigInt(log.liquidity)]));
  if (opened.length) {
    const swaps = await options.getLogs({ targets: opened.map((log: any) => log.pool), eventAbi: SWAP, flatten: false });
    opened.forEach((pool: any, i: number) => {
      const feePips = BigInt(pool.fee);
      const locked = lockedOf.get(pool.pool.toLowerCase());
      if (locked === undefined) throw new Error(`No MemeCoinListed for outbidfun pool ${pool.pool}`);
      const shareBps = shareOf.get(pool.coin.toLowerCase());
      if (shareBps === undefined) throw new Error(`Pool ${pool.pool} is for ${pool.coin}, which the factory did not launch`);
      const quoteIsToken0 = pool.quote.toLowerCase() < pool.coin.toLowerCase();
      for (const swap of swaps[i]) {
        // Positive is what the pool received, negative what it paid out.
        const quoteDelta = BigInt(quoteIsToken0 ? swap.amount0 : swap.amount1);
        const fee = quoteDelta > 0n
          ? (quoteDelta * feePips) / FEE_DENOMINATOR
          : (-quoteDelta * feePips) / (FEE_DENOMINATOR - feePips);
        // The locked position is full range, so it is always in the active liquidity.
        const active = BigInt(swap.liquidity);
        const toLocked = locked >= active ? fee : (fee * locked) / active;
        const toProtocol = (toLocked * shareBps) / BPS;
        dailyFees.add(pool.quote, fee, LABELS.swapFees);
        dailyRevenue.add(pool.quote, toProtocol, LABELS.swapToProtocol);
        dailySupplySideRevenue.add(pool.quote, toLocked - toProtocol, LABELS.swapToCreators);
        dailySupplySideRevenue.add(pool.quote, fee - toLocked, LABELS.swapToLPs);
      }
    });
  }

  const received = await options.getLogs({ target: REVENUE_ROUTER, eventAbi: REVENUE_RECEIVED });
  for (const log of received) {
    if (log.source.toLowerCase() !== FACTORY.toLowerCase() || log.asset !== ETHER) continue;
    dailyFees.addGasToken(log.amount, LABELS.launchFees);
    dailyRevenue.addGasToken(log.amount, LABELS.launchToProtocol);
  }

  const bids = await options.getLogs({ targets: OUTBID_MARKETS, eventAbi: BID_SETTLED });
  for (const log of bids) {
    const toProtocol = BigInt(log.toBuyback) + BigInt(log.toTreasury);
    dailyFees.add(log.asset, toProtocol, LABELS.bidFees);
    dailyRevenue.add(log.asset, toProtocol, LABELS.bidsToProtocol);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
    dailyVolume,
  };
};

const methodology = {
  Volume:
    "The reserve-asset leg of every bonding-curve buy and sell, fees included. Swaps in graduated coins' Uniswap V3 pools are not counted.",
  Fees:
    "Bonding-curve trading fees (1%, plus the snipe tax on buys in the first seconds after launch), creators' own taxes on curve trades, swap fees in graduated coins' Uniswap V3 pools, the ETH launch fee, and the 25% of every front-page bid paid to the protocol. A reward coin's transfer fee, a token tax paid in the launched coin, is not counted.",
  UserFees: "All fees are paid by users: traders, launchers and bidders.",
  Revenue:
    "The protocol's share of trading fees and of the swap fees earned by locked graduation liquidity (each coin's immutable protocolShareBps, 30% at launch), launch fees, and the buyback and treasury shares of bids.",
  ProtocolRevenue:
    "All revenue. It is split between the $OUTBID buyback vault and operations; $OUTBID has not launched, so none of it has reached token holders yet.",
  SupplySideRevenue:
    "The creator's share of trading fees and of the locked position's swap fees, the creator's own tax, and the swap fees earned by third-party liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.tradingFees]: "The 1% trading fee on the reserve-asset leg of every curve buy and sell, plus any snipe tax (FeesCharged.fee).",
    [LABELS.creatorTax]: "The creator's own tax on every curve trade, up to 10%, fixed at launch (FeesCharged.tax).",
    [LABELS.swapFees]: "The fee tier of a graduated coin's Uniswap V3 pool (1%) on every swap, measured on the quote-asset leg.",
    [LABELS.launchFees]: "The ETH fee paid to launch a coin, forwarded by the factory to the RevenueRouter.",
    [LABELS.bidFees]: "The buyback (20%) and treasury (5%) shares of every front-page bid, in USDG (BidSettled).",
  },
  UserFees: {
    [LABELS.tradingFees]: "The 1% trading fee on the reserve-asset leg of every curve buy and sell, plus any snipe tax (FeesCharged.fee).",
    [LABELS.creatorTax]: "The creator's own tax on every curve trade, up to 10%, fixed at launch (FeesCharged.tax).",
    [LABELS.swapFees]: "The fee tier of a graduated coin's Uniswap V3 pool (1%) on every swap, measured on the quote-asset leg.",
    [LABELS.launchFees]: "The ETH fee paid to launch a coin, forwarded by the factory to the RevenueRouter.",
    [LABELS.bidFees]: "The buyback (20%) and treasury (5%) shares of every front-page bid, in USDG (BidSettled).",
  },
  Revenue: {
    [LABELS.tradingToProtocol]: "The protocol's share of the trading fee: each coin's immutable protocolShareBps (30% at launch).",
    [LABELS.swapToProtocol]: "The protocol's share (protocolShareBps, 30% at launch) of the swap fees the coin's locked graduation position earns.",
    [LABELS.launchToProtocol]: "The whole launch fee.",
    [LABELS.bidsToProtocol]: "The buyback and treasury shares of every bid.",
  },
  ProtocolRevenue: {
    [LABELS.tradingToProtocol]: "The protocol's share of the trading fee: each coin's immutable protocolShareBps (30% at launch).",
    [LABELS.swapToProtocol]: "The protocol's share (protocolShareBps, 30% at launch) of the swap fees the coin's locked graduation position earns.",
    [LABELS.launchToProtocol]: "The whole launch fee.",
    [LABELS.bidsToProtocol]: "The buyback and treasury shares of every bid.",
  },
  SupplySideRevenue: {
    [LABELS.tradingToCreators]: "The creator's share of the trading fee (70% at launch), claimable from the FeeEscrow or paid to a reward coin's holders.",
    [LABELS.taxToCreators]: "The creator's own tax, paid to the creator in full.",
    [LABELS.swapToCreators]: "The creator's share (70% at launch) of the swap fees the coin's locked graduation position earns.",
    [LABELS.swapToLPs]: "Swap fees earned by third-party liquidity added to a graduated coin's pool.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  chains: [CHAIN.ROBINHOOD],
  fetch,
  start: "2026-09-27", // CoinFactory deployment (block 73821560)
};

export default adapter;
