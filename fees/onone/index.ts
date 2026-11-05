/**
 * OnOne launchpad fees for DefiLlama dimension-adapters.
 * Drop this folder in as fees/onone/ (this path is only so the file can be reviewed here).
 *
 * EVM: every live hook emits FeeTaken for the quote-token fee on buys and sells.
 *      The matching escrow Credited events are the same fees, already split.
 *      A launch also pays the router's creation fee, in the chain's native coin.
 * Solana: OnOne opens a Meteora DAMM v2 pool directly. There is no OnOne program
 *      that lists those pools, so each pool address is named below. The figure used
 *      is the LP fee (Meteora's own protocol cut stays on Meteora's listing).
 *      The creator position keeps creatorPct of that LP fee. OnOne keeps the rest.
 */
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const TREASURY = "0xf2D1f6A26989BFC164840c253eDcEC107a55Fa48";

const FEE_TAKEN = "event FeeTaken(bytes32 indexed id, address indexed trader, address quote, uint256 totalFee, address referrer)";
const CREDITED = "event Credited(address indexed account, address indexed token, uint256 amount)";
const LAUNCHED = "event Launched(address indexed token, address indexed creator, address quote, bytes32 poolId, uint128 liquidity)";

const SWAP_FEES = "Swap Fees";
const LAUNCH_FEES = "Launch Fees";
const CREATOR_FEES = "Creator and referrer fees";

type Suite = { hooks: string[]; escrows: string[]; routers: string[] };

const EVM: Record<string, Suite> = {
  [CHAIN.BASE]: {
    hooks: [
      "0x502ce07B31f2C2c652D65153c8722ab1DD56cacC",
      "0x76aCCCF81E1b785f1722BCCeB3B0624Dfb490aCC",
      "0x5fa041b24091D5e5Ac1B9F3E51722Abcfb0cCaCC",
      "0xFDC06cB1C86797303Bf551205c4942d1A0b00acc",
      "0x985C14BAa2a18316ffdA0aeFB3a632fAdfcA2AcC",
    ],
    escrows: [
      "0xA254AA83FE36c35dBeE3B2f23b01d80128185b49",
      "0x1AF210eC8e5e6F6fC511085d6e15d12Be728b7EE",
      "0xaD0A2BdFB35953cA75dA139194b1dEc5bad23CF0",
      "0xEfc80C5c1ef9EB0B7DfCC1061Ae5585592A8f959",
    ],
    routers: [
      "0xA20e3737227c6c707B1CF5Bec879723c984470Ee",
      "0x826C3C1e9E9F50DEcE2d9F076cdEF8f861f50F85",
      "0x99444176229B3Bc05282c2c2Bf5d15403eA6AC9E",
      "0x21a9C8A479b405427DE2007afc5d6179891cE880",
    ],
  },
  [CHAIN.ROBINHOOD]: {
    hooks: ["0x8725d243b5aadF23763C0768C815379d0870cACC"],
    escrows: ["0x5603fF223983679554F56951033A38715A801142"],
    routers: ["0x23c24C9F4cD644c7D5c3d92F45c732808C6e299C"],
  },
  [CHAIN.ARC]: {
    hooks: ["0x8725d243b5aadF23763C0768C815379d0870cACC"],
    escrows: ["0x5603fF223983679554F56951033A38715A801142"],
    routers: ["0x23c24C9F4cD644c7D5c3d92F45c732808C6e299C"],
  },
  [CHAIN.BSC]: {
    hooks: ["0x8b80cAA8a9fD75B5Fff923f5806c07F742B30ACC"],
    escrows: ["0x5603fF223983679554F56951033A38715A801142"],
    routers: ["0x23c24C9F4cD644c7D5c3d92F45c732808C6e299C"],
  },
};

/**
 * Every OnOne Meteora DAMM v2 pool. There is no OnOne program that lists them,
 * and Meteora's own pool list includes every Meteora pool, so a new launch is added here.
 * A pool Meteora does not serve is left off, rather than reported as zero.
 */
const SOL_POOLS: { pool: string; creatorPct: number }[] = [
  { pool: "82864UJ9DJvy62M5hzQwZKVSLi51gT6etbfuvPhE7Prk", creatorPct: 60 },
];

async function evm(options: FetchOptions) {
  const suite = EVM[options.chain];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const hook of suite.hooks) {
    const trades = await options.getLogs({ target: hook, eventAbi: FEE_TAKEN });
    for (const log of trades) dailyFees.add(log.quote, log.totalFee, SWAP_FEES);
  }

  for (const escrow of suite.escrows) {
    const credits = await options.getLogs({ target: escrow, eventAbi: CREDITED });
    for (const log of credits) {
      const toProtocol = String(log.account).toLowerCase() === TREASURY.toLowerCase();
      if (toProtocol) dailyRevenue.add(log.token, log.amount, SWAP_FEES);
      else dailySupplySideRevenue.add(log.token, log.amount, CREATOR_FEES);
    }
  }

  for (const router of suite.routers) {
    const launches = await options.getLogs({ target: router, eventAbi: LAUNCHED });
    if (!launches.length) continue;
    const feeWei = await options.api.call({ abi: "uint256:creationFeeWei", target: router });
    const total = BigInt(launches.length) * BigInt(feeWei);
    dailyFees.addGasToken(total, LAUNCH_FEES);
    dailyRevenue.addGasToken(total, LAUNCH_FEES);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

async function solana(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const result = {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };

  // fees["24h"] is a rolling snapshot, not the fees of an old day.
  const end = options.endTimestamp;
  if (Math.floor(Date.now() / 1000) - end > 36 * 60 * 60) return result;

  for (const { pool, creatorPct } of SOL_POOLS) {
    const row: { fees?: { "24h"?: number } } = await httpGet(`https://damm-v2.datapi.meteora.ag/pools/${pool}`);
    const raw = row?.fees?.["24h"];
    if (raw === undefined || raw === null) throw new Error(`OnOne: Meteora fees missing for ${pool}`);
    const lpFees = Number(raw);
    if (!Number.isFinite(lpFees)) throw new Error(`OnOne: Meteora fees not a number for ${pool}`);
    if (lpFees <= 0) continue;
    const creator = (lpFees * creatorPct) / 100;
    const platform = lpFees - creator;
    dailyFees.addUSDValue(lpFees, SWAP_FEES);
    dailyRevenue.addUSDValue(platform, SWAP_FEES);
    dailySupplySideRevenue.addUSDValue(creator, CREATOR_FEES);
  }

  return result;
}

const methodology = {
  Fees: "Quote-token fees taken by the OnOne launch hook on each swap, plus the native coin paid to launch a coin. On Solana, the LP fee earned by the OnOne Meteora pool (Meteora's own protocol cut is left on Meteora's listing). The 1% fee on swaps routed through the OnOne site is taken inside the Uniswap router and has no separate event, so it is not estimated here.",
  UserFees: "The same amounts paid by the trader or the launcher.",
  Revenue: "The protocol lane of each swap fee, credited to the OnOne treasury, plus the full launch fee. On Solana, the platform's share of the LP fee (40% when the creator share is 60%). The site's 1% routing fee is not included, because the router does not emit it on its own.",
  ProtocolRevenue: "Same as Revenue.",
  SupplySideRevenue: "The creator lane and the referrer lane of each swap fee. On Solana, the creator position's share of the LP fee.",
};

const breakdownMethodology = {
  Fees: {
    [SWAP_FEES]: "Hook swap fees, denominated in the pool's quote token. On Solana, the Meteora LP fee for the last 24 hours.",
    [LAUNCH_FEES]: "Router creation fee paid once per launch, in the chain's native coin.",
  },
  UserFees: {
    [SWAP_FEES]: "Paid by the trader on a buy or a sell.",
    [LAUNCH_FEES]: "Paid by the creator when the coin is launched.",
  },
  Revenue: {
    [SWAP_FEES]: "Protocol share credited to the treasury. On Solana, the platform share of the LP fee.",
    [LAUNCH_FEES]: "The whole launch fee is kept by the treasury.",
  },
  ProtocolRevenue: {
    [SWAP_FEES]: "Protocol share credited to the treasury.",
    [LAUNCH_FEES]: "The whole launch fee is kept by the treasury.",
  },
  SupplySideRevenue: {
    [CREATOR_FEES]: "Creator and referrer credits. On Solana, the creator position's share of the LP fee.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  // Solana publishes one rolling 24h figure. An hourly pull would add that same figure once per hour.
  pullHourly: false,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.BASE]: { fetch: evm, start: "2026-09-18" },
    [CHAIN.ROBINHOOD]: { fetch: evm, start: "2026-09-21" },
    [CHAIN.ARC]: { fetch: evm, start: "2026-09-25" },
    [CHAIN.BSC]: { fetch: evm, start: "2026-09-25" },
    // Meteora only publishes a rolling 24h fee, so this chain is read at "now", not backfilled.
    [CHAIN.SOLANA]: { fetch: solana, start: "2026-10-01", runAtCurrTime: true },
  },
};

export default adapter;
