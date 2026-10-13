import ADDRESSES from "../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

/**
 * Ferzan Factory — multi-chain memecoin launchpad.
 * Website: https://ferzan-factory.com   Twitter: https://x.com/FerzanFactory
 * Contracts: https://ferzan-factory.com/verify
 *
 * Every coin trades on its own bonding curve until it graduates to a DEX pool. This adapter counts
 * the curve trading fee only (fees after graduation belong to the DEX and are not counted here).
 *
 * EVM chains + Tron: one curve contract per coin, created by a Ferzan factory (CurveLaunched event).
 * Each curve emits Trade(trader, isBuy, nativeAmount, tokenAmount, fee, referrer, ...) and pays the fee
 * out in the same call: 50% to the coin creator, 10% to the referrer when one is set (taken from
 * Ferzan's half), the rest to the Ferzan treasury. Source: contracts/FerzanCurve.sol, _splitFee.
 *
 * Solana: Ferzan coins are Meteora Dynamic Bonding Curve pools under Ferzan's partner configs.
 * DBC reports trading_fee (split 50/50 creator / Ferzan by the config's creatorTradingFeePercentage)
 * and protocol_fee (Meteora's share) on every swap event.
 */

const CURVE_LAUNCHED = "event CurveLaunched(address indexed curve, address indexed token, address indexed creator)";
const TRADE =
  "event Trade(address indexed trader, bool isBuy, uint256 nativeAmount, uint256 tokenAmount, uint256 fee, address referrer, uint256 realEthAfter, uint256 tokensSoldAfter)";

// Fee split of the 1% curve fee, from FerzanCurve.sol (same on FerzanCurveUsdc.sol and FerzanTronCurve.sol)
const CREATOR_SHARE = 5000n; // 50% of the fee, basis points
const REFERRER_SHARE = 1000n; // 10% of the fee, taken from Ferzan's half
const BPS = 10_000n;

type ChainCfg = { start: string; factories?: string[]; fromBlock?: number; native?: string; nativeDiv?: bigint; fetch: any };

// Every factory that has created Ferzan curves, and a block before the first Ferzan launch on that chain
// (Ethereum and Tron have no launches yet, so theirs is an earlier block). Tron factories are given as
// 20-byte hex: TSxKr97AGGL6nEZNFYRnGfN48VjB9fi5AN (0 TRX launch fee, current) and
// TPS1aM5TwfmJHjzuA1XMy6wWme2LYqZ1BN (earlier 5 TRX factory).
const chainConfig: Record<string, ChainCfg> = {
  [CHAIN.SOLANA]: { start: "2026-09-25", fetch: fetchSolana },
  [CHAIN.BSC]: { start: "2026-10-04", fetch: fetchEvm, fromBlock: 125534029, factories: ["0xe8ca8382ab3ab55ffb310fb55da988fb83c922bd"] },
  [CHAIN.BASE]: { start: "2026-09-26", fetch: fetchEvm, fromBlock: 51753098, factories: ["0x10b1c446ff600dfc4dd9218a364bdbaf93a0fea2", "0xb56b4184dbb5bc5c67168ae3a4960e69392118de"] },
  [CHAIN.ETHEREUM]: { start: "2026-09-25", fetch: fetchEvm, fromBlock: 25500000, factories: ["0xb56b4184dbb5bc5c67168ae3a4960e69392118de"] },
  [CHAIN.ROBINHOOD]: { start: "2026-10-09", fetch: fetchEvm, fromBlock: 83665562, factories: ["0xb56b4184dbb5bc5c67168ae3a4960e69392118de"], native: ADDRESSES.robinhood.WETH },
  // Arc pays gas in USDC: native USDC has 18 decimals and is the same balance as the 6-decimal USDC ERC-20.
  [CHAIN.ARC]: { start: "2026-09-27", fetch: fetchEvm, fromBlock: 22900614, factories: ["0xe8ca8382ab3ab55ffb310fb55da988fb83c922bd", "0xb56b4184dbb5bc5c67168ae3a4960e69392118de"], native: ADDRESSES.arc.USDC, nativeDiv: 10n ** 12n },
  [CHAIN.TRON]: { start: "2026-09-25", fetch: fetchEvm, fromBlock: 82000000, factories: ["0xba4f6ff39b09639f6d0f7255a712a68690bea9fc", "0x93ab5401f6e286ac6f112fb4dfc826ef1089c53e"] },
};

// Ferzan's Meteora DBC partner configs (all quoted in wSOL).
const FERZAN_DBC_CONFIGS = [
  "AKNBSkUsVx2du7tJyuGzyC6ECFHP5fH69v8ntaFDYZLW", // community launches (current)
  "Gm9qwDLZbmQN19PubFK5vvfCpqF68voyYL8FHaLtfEky", // community launches (earlier)
  "8YoqjUBsyfgQv5s7fWR5nyjeMd43rKvMUEexAuYRCvbo", // FERZAN flagship
];

const LABEL = {
  CURVE: "Bonding Curve Trading Fees",
  TO_FERZAN: "Bonding Curve Fees To Ferzan",
  TO_CREATORS: "Bonding Curve Fees To Creators",
  TO_REFERRERS: "Bonding Curve Fees To Referrers",
  METEORA: "Meteora Protocol Fees",
};

/**
 * EVM + Tron fees: the 1% fee from every Trade event of every Ferzan curve, split into the creator's 50%,
 * the referrer's 10% (when paid) and Ferzan's remainder, exactly as FerzanCurve._splitFee pays it.
 */
async function fetchEvm(options: FetchOptions) {
  const { factories = [], fromBlock, native, nativeDiv = 1n } = chainConfig[options.chain];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const add = (b: any, amount: bigint, label: string) => {
    const v = (amount / nativeDiv).toString();
    if (native) b.add(native, v, label);
    else b.addGasToken(v, label);
  };

  const toBlock = await options.getToBlock();
  const launched = await options.getLogs({ targets: factories, eventAbi: CURVE_LAUNCHED, fromBlock, toBlock, cacheInCloud: true });
  const creatorOf: Record<string, string> = {};
  for (const l of launched) creatorOf[String(l.curve).toLowerCase()] = String(l.creator).toLowerCase();
  const curves = Object.keys(creatorOf);
  if (!curves.length) return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };

  const trades = await options.getLogs({ targets: curves, eventAbi: TRADE, entireLog: true, parseLog: true });
  for (const t of trades) {
    const { trader, fee, referrer } = t.args;
    const curve = String(t.address).toLowerCase();
    const total = BigInt(fee);
    if (total === 0n) continue;
    const toCreator = (total * CREATOR_SHARE) / BPS;
    const ref = String(referrer).toLowerCase();
    // the curve pays a referrer only when it is a real third party (FerzanCurve._splitFee)
    const paysRef = ref !== ADDRESSES.null && ref !== creatorOf[curve] && ref !== String(trader).toLowerCase() && ref !== curve;
    const toRef = paysRef ? (total * REFERRER_SHARE) / BPS : 0n;
    add(dailyFees, total, LABEL.CURVE);
    add(dailySupplySideRevenue, toCreator, LABEL.TO_CREATORS);
    if (toRef) add(dailySupplySideRevenue, toRef, LABEL.TO_REFERRERS);
    add(dailyRevenue, total - toCreator - toRef, LABEL.TO_FERZAN);
  }
  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
}

/**
 * Solana fees: DBC swap fees on pools under Ferzan's partner configs (Dune). trading_fee is split 50/50
 * creator / Ferzan; protocol_fee is Meteora's.
 */
async function fetchSolana(options: FetchOptions) {
  const configs = FERZAN_DBC_CONFIGS.map((c) => `'${c}'`).join(", ");
  const rows: { trading_fee: string; protocol_fee: string }[] = await queryDuneSql(options, `
    SELECT
      CAST(COALESCE(SUM(CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult.trading_fee') AS DECIMAL(38,0))), 0) AS VARCHAR) AS trading_fee,
      CAST(COALESCE(SUM(CAST(JSON_EXTRACT_SCALAR(swap_result, '$.SwapResult.protocol_fee') AS DECIMAL(38,0))), 0) AS VARCHAR) AS protocol_fee
    FROM meteora_solana.dynamic_bonding_curve_evt_evtswap
    WHERE config IN (${configs})
      AND evt_block_time >= from_unixtime(${options.startTimestamp})
      AND evt_block_time < from_unixtime(${options.endTimestamp})
  `);
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  // sums come back as exact integer strings (lamports), so no float rounding
  const trading = BigInt(rows[0]?.trading_fee || "0");
  const protocol = BigInt(rows[0]?.protocol_fee || "0");
  const toCreator = trading / 2n; // creatorTradingFeePercentage: 50 in Ferzan's config
  dailyFees.add(ADDRESSES.solana.SOL, trading.toString(), LABEL.CURVE);
  dailyFees.add(ADDRESSES.solana.SOL, protocol.toString(), LABEL.METEORA);
  dailyRevenue.add(ADDRESSES.solana.SOL, (trading - toCreator).toString(), LABEL.TO_FERZAN);
  dailySupplySideRevenue.add(ADDRESSES.solana.SOL, toCreator.toString(), LABEL.TO_CREATORS);
  dailySupplySideRevenue.add(ADDRESSES.solana.SOL, protocol.toString(), LABEL.METEORA);
  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
}

const adapter: SimpleAdapter = {
  version: 1, // the Solana leg is a Dune query, which must run daily
  dependencies: [Dependencies.DUNE],
  adapter: chainConfig, // each chain carries its own start and fetch
  methodology: {
    Fees: "The 1% bonding curve trading fee on every Ferzan coin before it graduates (Meteora's DBC fee on Solana, including Meteora's protocol share).",
    UserFees: "Same as Fees: paid by traders.",
    Revenue: "Ferzan's share of the curve fee: 50%, less 10% to a referrer when one is set. On Solana, half of the DBC trading fee.",
    ProtocolRevenue: "Same as Revenue. It goes to the Ferzan treasury.",
    SupplySideRevenue: "The coin creator's 50%, referrer payouts, and on Solana Meteora's protocol fee.",
    HoldersRevenue: "None.",
  },
  breakdownMethodology: {
    Fees: {
      [LABEL.CURVE]: "1% fee on every bonding curve buy and sell.",
      [LABEL.METEORA]: "Meteora's protocol fee on Ferzan's Solana curves.",
    },
    UserFees: {
      [LABEL.CURVE]: "1% fee on every bonding curve buy and sell.",
      [LABEL.METEORA]: "Meteora's protocol fee on Ferzan's Solana curves.",
    },
    Revenue: { [LABEL.TO_FERZAN]: "Ferzan's share of the curve fee." },
    ProtocolRevenue: { [LABEL.TO_FERZAN]: "Ferzan's share of the curve fee." },
    SupplySideRevenue: {
      [LABEL.TO_CREATORS]: "Half of the curve fee, paid to the coin creator.",
      [LABEL.TO_REFERRERS]: "10% of the curve fee, paid to the referrer of the trade when there is one.",
      [LABEL.METEORA]: "Meteora's protocol fee on Solana curves.",
    },
  },
};

export default adapter;
