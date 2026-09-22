import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// mercurifi (launch.mercuri.finance) - bonding-curve launchpad on Arc. A launch is one transaction: the factory
// deploys the token and its curve, and the token trades against that curve priced in USDC, which is also Arc's
// gas token. The buy that sells the curve out opens a Uniswap v4 pool at the curve's last price in the same
// transaction and sends the position to a locker with no withdraw function; after that the launch's trades are
// ordinary v4 swaps, and one immutable hook charges the same trade fee the curve did.
//
// Every fee of every kind is paid to a single FeeManager, so this adapter reads two events from one target:
//   FeeAccrued       the trade fee, already split into creator / referrer / platform. source 0 = curve, 1 = hook
//   PlatformAccrued  the launch fee (emitted with the factory as `from`) and the snipe tax (a curve as `from`)
// Source: verified contracts at https://github.com/mercuri-finance/mercuri-launch-contracts
const FEE_MANAGER = "0x31d1bfe59b783f4c077f853f962d1355afb52580";
const FACTORY = "0x8f5dfa0c48e14ccd03ae01795b8a95759ba859eb";

const FEE_ACCRUED =
  "event FeeAccrued(address indexed token, address indexed trader, address creator, address referrer, uint256 creatorAmount, uint256 referrerAmount, uint256 platformAmount, uint8 source)";
const PLATFORM_ACCRUED =
  "event PlatformAccrued(address indexed token, address indexed from, uint256 amount)";

// FeeManager's `source` byte: which venue the trade fee came from.
const SOURCE_CURVE = 0;

const CURVE_TRADE_FEES = "Curve Trade Fees";
const POOL_TRADE_FEES = "Pool Trade Fees";
const LAUNCH_FEES = "Launch Fees";
const SNIPE_TAX = "Snipe Tax";
const REFERRER_FEES = "Referrer Fees";
const TRADE_FEES_TO_TREASURY = "Trade Fees to Treasury";
const LAUNCH_FEES_TO_TREASURY = "Launch Fees to Treasury";
const SNIPE_TAX_TO_TREASURY = "Snipe Tax to Treasury";

// Amounts in both events are native USDC wei (18 decimals): on Arc, USDC is the gas token, so addGasToken
// prices them. There is no second asset anywhere in the protocol.
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [tradeFeeLogs, platformLogs] = await Promise.all([
    options.getLogs({ target: FEE_MANAGER, eventAbi: FEE_ACCRUED }),
    options.getLogs({ target: FEE_MANAGER, eventAbi: PLATFORM_ACCRUED }),
  ]);

  for (const log of tradeFeeLogs) {
    // A trade on the curve and a swap in a graduated token's pool pay the same rate; only the venue differs.
    const label = Number(log.source) === SOURCE_CURVE ? CURVE_TRADE_FEES : POOL_TRADE_FEES;
    const creatorAmount = BigInt(log.creatorAmount);
    const referrerAmount = BigInt(log.referrerAmount);
    const platformAmount = BigInt(log.platformAmount);

    dailyFees.addGasToken(creatorAmount + referrerAmount + platformAmount, label);
    // The creator's half is claimable by the token's creator, and the referrer's share by the trader's
    // referrer where one is bound on chain: both are costs to the protocol, not revenue.
    dailySupplySideRevenue.addGasToken(creatorAmount, METRIC.CREATOR_FEES);
    dailySupplySideRevenue.addGasToken(referrerAmount, REFERRER_FEES);
    dailyRevenue.addGasToken(platformAmount, TRADE_FEES_TO_TREASURY);
    dailyProtocolRevenue.addGasToken(platformAmount, TRADE_FEES_TO_TREASURY);
  }

  for (const log of platformLogs) {
    // Both of these go to the platform whole: the launch fee the factory forwards when it creates a token,
    // and the snipe tax a curve takes off buys in a token's first blocks.
    const fromFactory = String(log.from).toLowerCase() === FACTORY;
    const amount = BigInt(log.amount);

    dailyFees.addGasToken(amount, fromFactory ? LAUNCH_FEES : SNIPE_TAX);
    dailyRevenue.addGasToken(amount, fromFactory ? LAUNCH_FEES_TO_TREASURY : SNIPE_TAX_TO_TREASURY);
    dailyProtocolRevenue.addGasToken(
      amount,
      fromFactory ? LAUNCH_FEES_TO_TREASURY : SNIPE_TAX_TO_TREASURY,
    );
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  // Mainnet deployment, block 22060881.
  start: "2026-09-21",
  methodology: {
    Fees: "Every USDC a user pays the protocol: the 1% trade fee on the USDC side of each trade, on the bonding curve and in the graduated token's Uniswap v4 pool alike; the fee to create a token (1 USDC at deployment); and the snipe tax on buys in a token's first 120 blocks.",
    Revenue:
      "The platform's share: 0.30% of a trade where the trader has a referrer bound on chain and 0.50% where they do not, plus all launch fees and all snipe tax.",
    ProtocolRevenue:
      "Same as Revenue. There is no protocol token, so nothing is distributed to holders.",
    SupplySideRevenue:
      "0.50% of every trade to the token's creator and 0.20% to the trader's referrer, both claimable from the FeeManager.",
  },
  breakdownMethodology: {
    Fees: {
      [CURVE_TRADE_FEES]:
        "1% of the USDC side of every buy and sell against a bonding curve (FeeAccrued with source 0).",
      [POOL_TRADE_FEES]:
        "1% of the USDC side of every swap in a graduated token's Uniswap v4 pool, charged by the LaunchHook (FeeAccrued with source 1).",
      [LAUNCH_FEES]:
        "The fixed fee paid to create a token, forwarded by the factory (PlatformAccrued from the factory).",
      [SNIPE_TAX]:
        "Tax on buys only, 99% in the launch block falling in a straight line to zero over 120 blocks (PlatformAccrued from a curve).",
    },
    Revenue: {
      [TRADE_FEES_TO_TREASURY]: "The platform's share of each trade fee.",
      [LAUNCH_FEES_TO_TREASURY]: "Launch fees, which the platform keeps whole.",
      [SNIPE_TAX_TO_TREASURY]: "Snipe tax, which the platform keeps whole.",
    },
    ProtocolRevenue: {
      [TRADE_FEES_TO_TREASURY]: "The platform's share of each trade fee.",
      [LAUNCH_FEES_TO_TREASURY]: "Launch fees, which the platform keeps whole.",
      [SNIPE_TAX_TO_TREASURY]: "Snipe tax, which the platform keeps whole.",
    },
    SupplySideRevenue: {
      [METRIC.CREATOR_FEES]: "Half of every trade fee, claimable by the token's creator.",
      [REFERRER_FEES]:
        "0.20% of a trade by a trader who has a referrer bound on chain, claimable by that referrer.",
    },
  },
};

export default adapter;
