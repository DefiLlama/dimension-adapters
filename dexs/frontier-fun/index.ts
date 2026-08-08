import { PromisePool } from "@supercharge/promise-pool";
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// Frontier (frontier.fun) is a bonding-curve token launchpad on Robinhood Chain (4663).
//
// Every launched token trades against one shared BondingCurve contract that emits
// Buy/Sell for all markets. When a curve fills, the token wraps its raised ETH,
// pays out graduation fees, and seeds a Uniswap V4 pool (LPSeeded); post-graduation
// swaps are already counted by the uniswap-v4 adapter on this chain and are not
// double counted here.
// https://robinhoodchain.blockscout.com/address/0xCCa442899dFD80bf04340fa8C245C7EB02F71DD4
const BONDING_CURVE = "0xCCa442899dFD80bf04340fa8C245C7EB02F71DD4";
// https://robinhoodchain.blockscout.com/address/0x3cbC9395046607C083B383DC3588A3e8308dFf54
const FACTORY = "0x3cbC9395046607C083B383DC3588A3e8308dFf54";
// Seeds the Uniswap V4 pool at graduation. Source: BCTokenFactory.liquidityManager().
const LIQUIDITY_MANAGER = "0x97f3578083396D4ef2042868c6aE9d4eC91007A6";
// Takes a cut of the curve trade fee for referred trades and holds it as WETH
// until the referrer claims. Source: BondingCurve.referralManager().
const REFERRAL_MANAGER = "0x6Fb1160A663834e8E53E411CC7202A01F1b144DD";
const WETH = ADDRESSES.robinhood.WETH;

// keccak256("Transfer(address,address,uint256)"), the standard ERC20 topic0.
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const asTopic = (address: string) => "0x" + address.slice(2).toLowerCase().padStart(64, "0");

// Both events emit the GROSS ETH notional, but the fee's share of it differs by leg:
//   Buy.amount     is msg.value (fee-inclusive), so the fee is txFee / (10000 + txFee).
//   Sell.amountOut is pre-fee proceeds, so the fee is txFee / 10000.
// Treating either leg as net of the fee overstates both volume and fees.
const BUY_EVENT =
  "event Buy(address indexed user, address indexed token, uint256 amount, uint256 amountOut, uint256 totalSupply, uint256 marketCap, uint256 price, uint256 reserveBalance)";
const SELL_EVENT =
  "event Sell(address indexed user, address indexed token, uint256 amount, uint256 amountOut, uint256 totalSupply, uint256 marketCap, uint256 price, uint256 reserveBalance)";
const LP_SEEDED_EVENT = "event LPSeeded(address indexed token, address indexed pool)";
const TRANSFER_EVENT = "event Transfer(address indexed from, address indexed to, uint256 value)";
const TX_FEE_UPDATED_EVENT = "event TxFeeUpdated(uint256 fee)";
const REFERRAL_REWARD_EVENT =
  "event ReferralRewardReceived(address indexed referrer, address indexed referredUser, address indexed token, uint256 reward, bool isDirect)";
const OWNERSHIP_TRANSFERRED_EVENT =
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)";
const COIN_DEPLOYED_EVENT =
  "event CoinDeployed(address indexed creator, address indexed token, address factory, address lp, string name, string symbol, string description, string image, uint256 initialSupply, uint256 maxSupply, uint256 initialETHReserves, uint256 initialPrice, uint256 initialMarketCap, uint256 targetETH)";

// Block the BondingCurve and BCTokenFactory were both deployed in. The factory
// registered this curve in the same block (BondingCurveUpdated) and has never
// pointed at another one, so no earlier trades exist elsewhere.
const DEPLOY_BLOCK = 23472343;
// Trade fee the curve was constructed with. The constructor emits TxFeeUpdated,
// so the log scan below normally supplies the rate; this is the documented
// fallback if that scan ever comes back empty. Source: BondingCurve.txFee().
const INITIAL_TX_FEE_BPS = 150n;

// Fee rates on these contracts are basis points out of 10000.
const BPS = 10_000n;
// Split of the curve trade fee: 75% to the token's creator, 25% to the protocol
// (referral rewards come out of the protocol's quarter, never the creator's).
// Documented at https://docs.frontier.fun/fees-and-revenue.
const CURVE_FEE_CREATOR_BPS = 7_500n;

const LABEL = {
  // sources
  CurveTradeFees: "Curve Trade Fees",
  GraduationFees: "Graduation Fees",
  // destinations
  TradeFeesToProtocol: "Curve Trade Fees to Protocol",
  TradeFeesToCreators: "Curve Trade Fees to Creators",
  TradeFeesToReferrers: "Curve Trade Fees to Referrers",
  GraduationToProtocol: "Graduation Fees to Protocol",
  GraduationToSupplySide: "Graduation Fees to Creators",
};

const logIndexOf = (log: any) => Number(log.logIndex ?? log.index ?? 0);

/**
 * Cumulative governance logs as a timeline, oldest first, so a value can be
 * resolved as of the moment a given log was emitted rather than as of the end of
 * the window. Both the trade fee and the factory owner have changed on-chain.
 */
const asTimeline = (logs: any[], read: (log: any) => any) =>
  logs
    .map((log: any) => ({
      block: Number(log.blockNumber),
      index: logIndexOf(log),
      value: read(log),
    }))
    .sort((a, b) => a.block - b.block || a.index - b.index);

/** The timeline value in force when `log` was emitted. */
const valueAt = (timeline: ReturnType<typeof asTimeline>, log: any, fallback: any) => {
  const block = Number(log.blockNumber);
  const index = logIndexOf(log);
  let current = fallback;
  for (const entry of timeline) {
    if (entry.block > block || (entry.block === block && entry.index > index)) break;
    current = entry.value;
  }
  return current;
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // The trade fee is governed on-chain, so it is tracked through its own event
  // rather than hardcoded. It is read from logs rather than an eth_call because
  // Robinhood Chain's public RPC prunes state and rejects historical calls, which
  // would break every backfill.
  const [buyLogs, sellLogs, graduations, feeChanges] = await Promise.all([
    options.getLogs({ target: BONDING_CURVE, eventAbi: BUY_EVENT, onlyArgs: false }),
    options.getLogs({ target: BONDING_CURVE, eventAbi: SELL_EVENT, onlyArgs: false }),
    options.getLogs({ target: BONDING_CURVE, eventAbi: LP_SEEDED_EVENT }),
    options.getLogs({
      target: BONDING_CURVE,
      eventAbi: TX_FEE_UPDATED_EVENT,
      fromBlock: DEPLOY_BLOCK,
      cacheInCloud: true,
      onlyArgs: false,
    }),
  ]);

  const feeTimeline = asTimeline(feeChanges, (log: any) => BigInt(log.args.fee));
  const txFeeBpsAt = (log: any) => valueAt(feeTimeline, log, INITIAL_TX_FEE_BPS);

  const addTrade = (gross: bigint, fee: bigint) => {
    dailyVolume.addGasToken(gross);
    dailyFees.addGasToken(fee, LABEL.CurveTradeFees);
    const creatorCut = (fee * CURVE_FEE_CREATOR_BPS) / BPS;
    dailySupplySideRevenue.addGasToken(creatorCut, LABEL.TradeFeesToCreators);
    dailyProtocolRevenue.addGasToken(fee - creatorCut, LABEL.TradeFeesToProtocol);
  };

  buyLogs.forEach((log: any) => {
    const gross = BigInt(log.args.amount);
    const txFeeBps = txFeeBpsAt(log);
    addTrade(gross, (gross * txFeeBps) / (BPS + txFeeBps));
  });
  sellLogs.forEach((log: any) => {
    const gross = BigInt(log.args.amountOut);
    addTrade(gross, (gross * txFeeBpsAt(log)) / BPS);
  });

  // A referred trade routes part of the protocol's quarter to the referrer, paid
  // in WETH by the ReferralManager. It comes out of protocol revenue rather than
  // adding to it, since the docs are explicit it never comes out of the creator's
  // share (ReferralManager.directRefFeeBps is 9.09% of the fee, well inside that quarter).
  const referralRewards = await options.getLogs({
    target: REFERRAL_MANAGER,
    eventAbi: REFERRAL_REWARD_EVENT,
  });
  referralRewards.forEach((log: any) => {
    const reward = BigInt(log.reward);
    if (reward === 0n) return;
    // Denominations follow the money: the protocol's share accrued to the curve
    // as native ETH, and the referrer's slice left it wrapped, so the referrer is
    // credited in WETH rather than the gas token.
    dailyProtocolRevenue.addGasToken(-reward, LABEL.TradeFeesToProtocol);
    dailySupplySideRevenue.add(WETH, reward, LABEL.TradeFeesToReferrers);
  });

  if (graduations.length) {
    // At graduation a token wraps its fee share of the ETH it raised and pays it
    // out, currently 5% to the creator (BCToken.CREATOR_FEE) and 0% to the factory
    // owner (BCToken.PROTOCOL_FEE), while the rest seeds the Uniswap V4 pool as
    // native ETH. Reading the WETH transfers instead of applying the configured
    // rates keeps the split exact across per-token fee settings and changes to them.
    //
    // The creator comes from the token's own CoinDeployed event, and the protocol
    // owner from the factory's ownership history, which has been rotated once.
    const [launches, ownershipChanges] = await Promise.all([
      options.getLogs({
        target: FACTORY,
        eventAbi: COIN_DEPLOYED_EVENT,
        fromBlock: DEPLOY_BLOCK,
        cacheInCloud: true,
      }),
      options.getLogs({
        target: FACTORY,
        eventAbi: OWNERSHIP_TRANSFERRED_EVENT,
        fromBlock: DEPLOY_BLOCK,
        cacheInCloud: true,
        onlyArgs: false,
      }),
    ]);

    const creatorOf: Record<string, string> = {};
    launches.forEach((log: any) => {
      creatorOf[String(log.token).toLowerCase()] = String(log.creator).toLowerCase();
    });
    // The owner has already been rotated once, so it is resolved per payout
    // rather than taken as the latest: a graduation that predates the rotation
    // paid the owner of the day.
    const ownerTimeline = asTimeline(ownershipChanges, (log: any) =>
      String(log.args.newOwner).toLowerCase()
    );

    // One getLogs per graduation, bounded so a backfill day with many
    // graduations cannot flood the RPC endpoint.
    const { results: payoutLegs, errors: payoutErrors } = await PromisePool.withConcurrency(5)
      .for(graduations)
      .process(async (log: any) => {
        const transfers = await options.getLogs({
          target: WETH,
          eventAbi: TRANSFER_EVENT,
          topics: [TRANSFER_TOPIC, asTopic(log.token)],
          onlyArgs: false,
        });
        return transfers.map((transfer: any) => ({
          transfer,
          token: String(log.token).toLowerCase(),
        }));
      });

    // PromisePool collects rejections instead of rethrowing them. Swallowing one
    // would silently drop a graduation's fees and understate the day, so fail the
    // run rather than report a partial figure.
    if (payoutErrors.length) {
      throw new Error(
        `[frontier-fun] ${payoutErrors.length} of ${graduations.length} graduation payout queries failed: ${payoutErrors[0].message}`
      );
    }

    payoutLegs.flat().forEach(({ transfer, token }: any) => {
      const recipient = String(transfer.args.to).toLowerCase();
      // Guard for a WETH-paired pool: today's markets seed with native ETH, so
      // no WETH ever reaches the LiquidityManager, but a WETH leg would be
      // liquidity rather than a fee.
      if (recipient === LIQUIDITY_MANAGER.toLowerCase()) return;
      const amount = BigInt(transfer.args.value);
      if (amount === 0n) return;

      // The contract pays exactly two fee legs here: CREATOR_FEE to the creator
      // and PROTOCOL_FEE to the factory owner. Anything else is not a known fee,
      // so it is reported rather than guessed at.
      if (recipient === creatorOf[token]) {
        dailyFees.add(WETH, amount, LABEL.GraduationFees);
        dailySupplySideRevenue.add(WETH, amount, LABEL.GraduationToSupplySide);
      } else if (recipient === valueAt(ownerTimeline, transfer, "")) {
        dailyFees.add(WETH, amount, LABEL.GraduationFees);
        dailyProtocolRevenue.add(WETH, amount, LABEL.GraduationToProtocol);
      } else {
        console.error(
          `[frontier-fun] unclassified graduation payout from ${token} to ${recipient}, not counted`
        );
      }
    });
  }

  // Frontier has no protocol token, so there are no holders revenue and
  // Revenue == ProtocolRevenue == Fees - SupplySideRevenue. Cloned so the two
  // returned dimensions do not alias the same Balances instance.
  const dailyRevenue = dailyProtocolRevenue.clone();

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume:
    "Gross ETH notional (fees included) of buys and sells executed on Frontier bonding curves, taken directly from the shared BondingCurve contract's Buy/Sell events, both of which emit the gross figure. Once a curve fills it graduates to a Uniswap V4 pool on the canonical PoolManager; those swaps are counted by the uniswap-v4 adapter on Robinhood Chain and are not double counted here.",
  Fees: "The bonding-curve trade fee charged on every buy and sell (1.5% of the trade's cost at the time of writing, rate tracked on-chain via TxFeeUpdated), plus the fees a token pays out of the ETH it raised when its curve fills and seeds its Uniswap V4 pool.",
  UserFees: "Same as Fees: every fee is paid by traders out of their trade or out of the ETH they raised.",
  Revenue:
    "Protocol revenue: the protocol's 25% of the bonding-curve trade fee, net of the referrer's share on referred trades (which comes out of that 25%), plus the protocol owner's share of graduation payouts. Frontier has no protocol token, so there is no holders revenue and Revenue equals ProtocolRevenue.",
  ProtocolRevenue:
    "The protocol's 25% of the bonding-curve trade fee, net of referrer rewards, plus WETH sent to the factory owner at graduation.",
  SupplySideRevenue:
    "The creator's 75% of every bonding-curve trade fee, the referrer's share on referred trades, and the graduation fee paid to the token creator (5% of the ETH its curve raised).",
};

const feesBreakdown = {
  [LABEL.CurveTradeFees]:
    "Trade fee withheld by the bonding curve on every buy and sell, at the on-chain txFee rate (150 bps at the time of writing). Buy.amount is fee-inclusive so the fee is txFee/(10000+txFee) of it; Sell.amountOut is pre-fee so the fee is txFee/10000 of it.",
  [LABEL.GraduationFees]:
    "WETH paid out of the ETH a token raised when its curve fills, to the creator (5%) and the factory owner (0% at the time of writing). The ETH that seeds the Uniswap V4 pool is liquidity, not a fee, and is excluded.",
};

const protocolRevenueBreakdown = {
  [LABEL.TradeFeesToProtocol]:
    "The protocol's 25% of the bonding-curve trade fee, net of the referrer's share on referred trades.",
  [LABEL.GraduationToProtocol]: "Graduation payout sent to the factory owner.",
};

const breakdownMethodology = {
  // dailyUserFees is dailyFees, and dailyRevenue is dailyProtocolRevenue, so those
  // pairs share the same breakdown.
  Fees: feesBreakdown,
  UserFees: feesBreakdown,
  Revenue: protocolRevenueBreakdown,
  ProtocolRevenue: protocolRevenueBreakdown,
  SupplySideRevenue: {
    [LABEL.TradeFeesToCreators]:
      "The token creator's 75% of every bonding-curve trade fee.",
    [LABEL.TradeFeesToReferrers]:
      "The referrer's share of the curve trade fee on a referred trade, held as WETH by the ReferralManager until claimed.",
    [LABEL.GraduationToSupplySide]:
      "The graduation fee paid to the token creator, 5% of the ETH its curve raised.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-30", // first CoinDeployed event, block 23650298
  methodology,
  breakdownMethodology,
};

export default adapter;
