// outbidfun.lol — fees, revenue & volume adapter.
//
// outbidfun.lol (https://outbidfun.lol) is a token launchpad on Robinhood Chain (chainId 4663).
// Every coin is its own contract with its own bonding curve, priced in a reserve asset its
// creator picks from the ones the factory lists (WETH, USDG, tokenised shares). Coins are found
// from the factory's MemeCoinDeployed events. When a curve's reserve reaches its cap the coin
// graduates into the platform's own Uniswap V3 pool with the liquidity locked forever;
// post-graduation swaps are pool trades and are not counted here.
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
import * as sdk from "@defillama/sdk";
import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const FACTORY = "0xDadC43dbf60eA5d4598C39500Ede46De6A14c0d0";
const FACTORY_DEPLOY_BLOCK = 73821560;
const REVENUE_ROUTER = "0xeEc171B409788644acBf1c50B825Cc6d9682D9b7";
// The first market is frozen and its board moved to the second; both have history.
const OUTBID_MARKETS = ["0x1Eaca99186F58A258B08fd7A25524A20c31def63", "0xad7ca6bf8c0ab7793eBEC811Da5F54304383669A"];
const ETHER = "0x0000000000000000000000000000000000000000";
const BPS = 10_000n;

const MEMECOIN_DEPLOYED = "event MemeCoinDeployed(address indexed creator, address indexed memecoin, address indexed quoteAsset)";
const BUY = "event Buy(address indexed by, uint256 amount, uint256 liquidity, uint256 newSupply, uint256 timestamp)";
const SELL = "event Sell(address indexed by, uint256 amount, uint256 liquidity, uint256 newSupply, uint256 timestamp)";
const FEES_CHARGED = "event FeesCharged(address indexed by, uint256 fee, uint256 tax)";
const REVENUE_RECEIVED = "event RevenueReceived(address indexed source, address indexed asset, uint256 amount)";
const BID_SETTLED =
  "event BidSettled(address indexed token, address indexed asset, uint256 burnSpent, uint256 coinsBurned, uint256 toBuyback, uint256 toTreasury)";

const LABELS = {
  tradingFees: METRIC.TRADING_FEES,
  creatorTax: "Creator Tax",
  launchFees: "Token Launch Fees",
  bidFees: "Front Page Bid Fees",
  tradingToProtocol: "Trading Fees To Protocol",
  launchToProtocol: "Token Launch Fees To Protocol",
  bidsToProtocol: "Front Page Bid Fees To Protocol",
  tradingToCreators: "Trading Fees To Creators",
  taxToCreators: "Creator Tax To Creators",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyVolume = options.createBalances();

  const launches = await options.getLogs({
    target: FACTORY,
    eventAbi: MEMECOIN_DEPLOYED,
    fromBlock: FACTORY_DEPLOY_BLOCK,
    cacheInCloud: true,
  });
  const coins: string[] = launches.map((launch: any) => launch.memecoin);
  const reserveOf: string[] = launches.map((launch: any) => launch.quoteAsset);

  if (coins.length) {
    const [buys, sells, charges] = await Promise.all(
      [BUY, SELL, FEES_CHARGED].map((eventAbi) => options.getLogs({ targets: coins, eventAbi, flatten: false }))
    );
    // Immutable on each coin, so it is read at the latest block rather than the window's: the
    // chain's public RPC keeps no historical state.
    const latestApi = new sdk.ChainApi({ chain: options.chain });
    const shares = await latestApi.multiCall({ abi: "uint16:protocolShareBps", calls: coins });

    coins.forEach((_, i) => {
      const reserve = reserveOf[i];
      const shareBps = BigInt(shares[i]);
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
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyVolume,
  };
};

const methodology = {
  Volume:
    "The reserve-asset leg of every bonding-curve buy and sell, fees included. Swaps in a graduated coin's Uniswap V3 pool are not counted.",
  Fees:
    "Bonding-curve trading fees (1%, plus the snipe tax on buys in the first seconds after launch), creators' own taxes on trades, the ETH launch fee, and the 25% of every front-page bid paid to the protocol.",
  UserFees: "All fees are paid by users: traders, launchers and bidders.",
  Revenue:
    "The protocol's share of trading fees (each coin's immutable protocolShareBps, 30% at launch), launch fees, and the buyback and treasury shares of bids.",
  ProtocolRevenue:
    "All revenue. It is split between the $OUTBID buyback vault and operations; $OUTBID has not launched, so none of it has reached token holders yet.",
  SupplySideRevenue: "The creator's share of trading fees, and the creator's own tax, paid to the creator or, for a reward coin, to its holders.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.tradingFees]: "The 1% trading fee on the reserve-asset leg of every curve buy and sell, plus any snipe tax (FeesCharged.fee).",
    [LABELS.creatorTax]: "The creator's own tax on every curve trade, up to 10%, fixed at launch (FeesCharged.tax).",
    [LABELS.launchFees]: "The ETH fee paid to launch a coin, forwarded by the factory to the RevenueRouter.",
    [LABELS.bidFees]: "The buyback (20%) and treasury (5%) shares of every front-page bid, in USDG (BidSettled).",
  },
  UserFees: {
    [LABELS.tradingFees]: "The 1% trading fee on the reserve-asset leg of every curve buy and sell, plus any snipe tax (FeesCharged.fee).",
    [LABELS.creatorTax]: "The creator's own tax on every curve trade, up to 10%, fixed at launch (FeesCharged.tax).",
    [LABELS.launchFees]: "The ETH fee paid to launch a coin, forwarded by the factory to the RevenueRouter.",
    [LABELS.bidFees]: "The buyback (20%) and treasury (5%) shares of every front-page bid, in USDG (BidSettled).",
  },
  Revenue: {
    [LABELS.tradingToProtocol]: "The protocol's share of the trading fee: each coin's immutable protocolShareBps (30% at launch).",
    [LABELS.launchToProtocol]: "The whole launch fee.",
    [LABELS.bidsToProtocol]: "The buyback and treasury shares of every bid.",
  },
  ProtocolRevenue: {
    [LABELS.tradingToProtocol]: "The protocol's share of the trading fee: each coin's immutable protocolShareBps (30% at launch).",
    [LABELS.launchToProtocol]: "The whole launch fee.",
    [LABELS.bidsToProtocol]: "The buyback and treasury shares of every bid.",
  },
  SupplySideRevenue: {
    [LABELS.tradingToCreators]: "The creator's share of the trading fee (70% at launch), claimable from the FeeEscrow or paid to a reward coin's holders.",
    [LABELS.taxToCreators]: "The creator's own tax, paid to the creator in full.",
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
