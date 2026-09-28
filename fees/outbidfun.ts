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
//     locked position (the listing manager's, found from the pool's Mint events) earns its share
//     of the liquidity the swap trades against, range by range (see `lockedShareOf`), split like
//     the trading fee: `protocolShareBps` to the protocol when CoinListingManager.collectFees
//     sweeps it, the rest to the creator. Anything left is earned by third-party LPs. The factory's protocol fee switch stays off: its owner,
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

// Robinhood Chain mainnet deployments. Source and addresses:
// https://github.com/outbidfun/outbidfun-contracts/blob/main/DEPLOYMENTS.md
// Two launchpads, both live. The first (27 September 2026) keeps its coins trading on their
// curves and graduating into its own Uniswap V3; the second (28 September 2026), on a
// constant-product curve, takes every new launch and has a Uniswap V3 of its own. Each factory
// launches coins and each listing manager opens its factory's coins' pools; `fromBlock` is the
// block each contract was deployed in, and nothing emits before it.
// CoinFactory (first): https://robinhoodchain.blockscout.com/address/0xDadC43dbf60eA5d4598C39500Ede46De6A14c0d0
// CoinFactory (second): https://robinhoodchain.blockscout.com/address/0xDD0e33a1d5452275E563020F58fC989f26B74CF6
const FACTORIES = [
  { address: "0xDadC43dbf60eA5d4598C39500Ede46De6A14c0d0", fromBlock: 73821560 },
  { address: "0xDD0e33a1d5452275E563020F58fC989f26B74CF6", fromBlock: 74842311 },
];
// The block of the first deployment's first transaction; nothing here emits before it.
const DEPLOY_BLOCK = 73821560;
// CoinListingManager (first): https://robinhoodchain.blockscout.com/address/0xcF4EEc2a27ff46f1dB10Ef6ce3a65704EF5997E4
// CoinListingManager (second): https://robinhoodchain.blockscout.com/address/0xE15E852e3D16939719001D04f5e4d930C1F0DF26
const LISTING_MANAGERS = [
  { address: "0xcF4EEc2a27ff46f1dB10Ef6ce3a65704EF5997E4", fromBlock: 73821560 },
  { address: "0xE15E852e3D16939719001D04f5e4d930C1F0DF26", fromBlock: 74842206 },
];
const isListingManager = (owner: string) => LISTING_MANAGERS.some((manager) => manager.address.toLowerCase() === owner.toLowerCase());
const isFactory = (source: string) => FACTORIES.some((factory) => factory.address.toLowerCase() === source.toLowerCase());
// RevenueRouter, the listing manager's `treasury()`, where the launch fee is paid:
// https://robinhoodchain.blockscout.com/address/0xeEc171B409788644acBf1c50B825Cc6d9682D9b7
const REVENUE_ROUTER = "0xeEc171B409788644acBf1c50B825Cc6d9682D9b7";
// OutbidMarket, both with history (listed in DEPLOYMENTS.md above):
// - the first, frozen since 28 September 2026, its board moved to the second:
//   https://robinhoodchain.blockscout.com/address/0x1Eaca99186F58A258B08fd7A25524A20c31def63
// - the current one:
//   https://robinhoodchain.blockscout.com/address/0xad7ca6bf8c0ab7793eBEC811Da5F54304383669A
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
const MINT =
  "event Mint(address sender, address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)";
const BURN = "event Burn(address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)";
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

type Position = { lower: number; upper: number; liquidity: bigint };

/**
 * The locked position's share of one swap's fee. A swap pays its fee on the input as the price
 * moves through ranges of constant liquidity, and each range's fee is shared among the positions
 * active in it, so the share is the locked position's liquidity over the range's, weighted by the
 * input traded there. The Swap event gives the end price; walking back from it, the output
 * amount, which carries no fee, fixes where the swap started and how much traded in each range.
 * `others` is every position but the locked one. Ratios only, so floating point is enough.
 */
function lockedShareOf(swap: any, others: Position[], locked: bigint): number {
  const lockedL = Number(locked);
  // Only the locked full-range position: it earns the whole fee.
  if (!others.length) return 1;
  const sqrtAt = (tick: number) => Math.pow(1.0001, tick / 2);
  const liquidityAt = (sqrtPrice: number) =>
    others.reduce((sum, p) => (sqrtAt(p.lower) <= sqrtPrice && sqrtPrice < sqrtAt(p.upper) ? sum + Number(p.liquidity) : sum), lockedL);
  const bounds = Array.from(new Set(others.flatMap((p) => [sqrtAt(p.lower), sqrtAt(p.upper)]))).sort((a, b) => a - b);
  const zeroForOne = BigInt(swap.amount0) > 0n;
  let remaining = Math.abs(Number(zeroForOne ? swap.amount1 : swap.amount0));
  let current = Number(swap.sqrtPriceX96) / 2 ** 96;
  let input = 0;
  let lockedInput = 0;
  // Token0 in: the price fell, so walk up; token1 in: it rose, so walk down.
  for (let step = 0; step <= bounds.length && remaining > 0; step++) {
    if (zeroForOne) {
      const next = bounds.find((bound) => bound > current) ?? Infinity;
      const L = liquidityAt(Number.isFinite(next) ? (current + next) / 2 : current * (1 + 1e-9));
      const capacity = L * (next - current); // token1 this range can pay out
      const end = capacity >= remaining ? current + remaining / L : next;
      const traded = L * (1 / current - 1 / end); // token0 in, before the fee
      input += traded;
      lockedInput += (traded * lockedL) / L;
      remaining = capacity >= remaining ? 0 : remaining - capacity;
      current = end;
    } else {
      const next = [...bounds].reverse().find((bound) => bound < current) ?? 0;
      const L = liquidityAt(next > 0 ? (current + next) / 2 : current * (1 - 1e-9));
      const capacity = next > 0 ? L * (1 / next - 1 / current) : Infinity; // token0 this range can pay out
      const end = capacity >= remaining ? 1 / (1 / current + remaining / L) : next;
      const traded = L * (current - end); // token1 in, before the fee
      input += traded;
      lockedInput += (traded * lockedL) / L;
      remaining = capacity >= remaining ? 0 : remaining - capacity;
      current = end;
    }
  }
  return input > 0 ? lockedInput / input : lockedL / liquidityAt(Number(swap.sqrtPriceX96) / 2 ** 96);
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyVolume = options.createBalances();

  const launches = (
    await Promise.all(
      FACTORIES.map(({ address, fromBlock }) =>
        options.getLogs({ target: address, eventAbi: MEMECOIN_DEPLOYED, fromBlock, cacheInCloud: true })
      )
    )
  ).flat();
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

  // Graduated pools, with the fee tier each was opened at, from both listing managers.
  const opened = (
    await Promise.all(
      LISTING_MANAGERS.map(({ address, fromBlock }) =>
        options.getLogs({ target: address, eventAbi: POOL_OPENED, fromBlock, cacheInCloud: true })
      )
    )
  ).flat();
  if (opened.length) {
    const pools = opened.map((log: any) => log.pool);
    const swaps = await options.getLogs({ targets: pools, eventAbi: SWAP, onlyArgs: false, flatten: false });
    if (swaps.some((logs: any[]) => logs.length)) {
      // Every position's liquidity at each swap, replayed from the pools' whole Mint/Burn history:
      // few events, changing slowly, like a pool list.
      const mints = await options.getLogs({ targets: pools, eventAbi: MINT, fromBlock: DEPLOY_BLOCK, onlyArgs: false, flatten: false, cacheInCloud: true });
      const burns = await options.getLogs({ targets: pools, eventAbi: BURN, fromBlock: DEPLOY_BLOCK, onlyArgs: false, flatten: false, cacheInCloud: true });
      const positioned = (log: any, kind: string) => {
        const blockNumber = Number(log.blockNumber);
        const logIndex = Number(log.logIndex);
        if (!log.args || !Number.isFinite(blockNumber) || !Number.isFinite(logIndex)) throw new Error("outbidfun: log without args or position");
        return { kind, blockNumber, logIndex, ...log.args };
      };
      opened.forEach((pool: any, i: number) => {
        const feePips = BigInt(pool.fee);
        const shareBps = shareOf.get(pool.coin.toLowerCase());
        // A coin neither factory launched earns the protocol nothing here, so its pool is skipped
        // rather than failing the whole hour's curve, launch and bid figures with it.
        if (shareBps === undefined) {
          console.warn(`outbidfun: skipping pool ${pool.pool}: its coin ${pool.coin} was not launched by a configured factory`);
          return;
        }
        const quoteIsToken0 = pool.quote.toLowerCase() < pool.coin.toLowerCase();
        const events = [
          ...mints[i].map((log: any) => positioned(log, "mint")),
          ...burns[i].map((log: any) => positioned(log, "burn")),
          ...swaps[i].map((log: any) => positioned(log, "swap")),
        ].sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
        const positions = new Map<string, Position>();
        let lockedKey = "";
        for (const event of events) {
          if (event.kind !== "swap") {
            const key = `${event.owner.toLowerCase()}:${event.tickLower}:${event.tickUpper}`;
            const position = positions.get(key) ?? { lower: Number(event.tickLower), upper: Number(event.tickUpper), liquidity: 0n };
            position.liquidity += event.kind === "mint" ? BigInt(event.amount) : -BigInt(event.amount);
            positions.set(key, position);
            // The listing manager's graduation position: never burned, and the only one it owns.
            if (isListingManager(event.owner)) lockedKey = key;
            continue;
          }
          const locked = positions.get(lockedKey)?.liquidity ?? 0n;
          if (locked === 0n) throw new Error(`outbidfun pool ${pool.pool} swapped before its graduation position was minted`);
          const others = [...positions].filter(([key, p]) => key !== lockedKey && p.liquidity > 0n).map(([, p]) => p);
          // Positive is what the pool received, negative what it paid out.
          const quoteDelta = BigInt(quoteIsToken0 ? event.amount0 : event.amount1);
          const fee = quoteDelta > 0n
            ? (quoteDelta * feePips) / FEE_DENOMINATOR
            : (-quoteDelta * feePips) / (FEE_DENOMINATOR - feePips);
          const share = lockedShareOf(event, others, locked);
          const toLocked = share >= 1 ? fee : (fee * BigInt(Math.round(share * 1e9))) / 1_000_000_000n;
          const toProtocol = (toLocked * shareBps) / BPS;
          dailyFees.add(pool.quote, fee, LABELS.swapFees);
          dailyRevenue.add(pool.quote, toProtocol, LABELS.swapToProtocol);
          dailySupplySideRevenue.add(pool.quote, toLocked - toProtocol, LABELS.swapToCreators);
          dailySupplySideRevenue.add(pool.quote, fee - toLocked, LABELS.swapToLPs);
        }
      });
    }
  }

  const received = await options.getLogs({ target: REVENUE_ROUTER, eventAbi: REVENUE_RECEIVED });
  for (const log of received) {
    if (!isFactory(log.source) || log.asset !== ETHER) continue;
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
  start: "2026-09-27", // the first CoinFactory's deployment (block 73821560)
};

export default adapter;
