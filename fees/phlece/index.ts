// DefiLlama dimension adapter for Phlece v2 (fees). Copy to DefiLlama/dimension-adapters as fees/phlece/index.ts
// (replaces the closed v1 adapter from PR #9626, which read the retired bonding-curve factory).
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Phlece (phlece.fun) - token launchpad on Arc. Every coin launches through one launch contract straight into
// its own Uniswap v4 pool, with a per-coin hook that charges the fee (0.98% base + the creator's 1-10% tax)
// in the coin's paired asset (USDC, EURC, GBPA, cirBTC, WETH or XAUM). Source verified on Sourcify and
// explorer.arc.io. The launch contract cannot be upgraded.
const PORTAL = "0xddd1dceb5c61f4f3ebb6f9310e637e92672667ac";
const PORTAL_DEPLOY_BLOCK = 23164491; // the launch contract's deployment block (2026-09-28)
// The team's two test launches (2026-09-28, hidden on phlece.fun): their trades were the team testing the
// contracts, not users, so they are left out.
const TEAM_TEST_COINS = new Set([
  "0x02df67a8a28d8141e2991e0da414ceebec022a44", // CHECK1 "Launch Check"
  "0x5b6c09e49dd08eb7d7d5a3e9bf4e7e69046074c8", // test coin #2
]);

const LAUNCHED = "event Launched(address indexed token, address indexed creator, address hook, address escrow, address locker, uint256 positionId, int24 tickStart, int24 tickBond)";
// Emitted by each coin's hook on every fee-paying swap: `fee` is the whole trading fee and `surcharge` the
// opening anti-snipe surcharge (first 3 seconds only), both in the coin's paired asset.
const QUOTE_FEE_TAKEN = "event QuoteFeeTaken(uint256 fee, uint256 surcharge, bool exactInput, bool isBuy)";

const TRADING_FEES = "Trading Fees";
const SNIPE_SURCHARGE = "Anti-Snipe Surcharge";
const FEES_TO_TREASURY = "Trading Fees To Protocol Treasury";
const SURCHARGE_TO_TREASURY = "Anti-Snipe Surcharge To Protocol Treasury";
const FEES_TO_CREATORS = METRIC.CREATOR_FEES;
const FEES_TO_HOLDERS = "Trading Fees To Launched Token Holders";
const FEES_TO_BUYBACK = "Trading Fees To Launched Token Buyback And Burn";
const FEES_TO_LIQUIDITY = "Trading Fees To Launched Token Locked Liquidity";

const BPS = 10000n;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Every launch up to the end of this window, from the launch contract's own events (cached; the list only grows).
  const toBlock = await options.getToBlock();
  const launches = (await options.getLogs({ target: PORTAL, eventAbi: LAUNCHED, fromBlock: PORTAL_DEPLOY_BLOCK, toBlock, cacheInCloud: true }))
    .filter((l: any) => !TEAM_TEST_COINS.has(String(l.token).toLowerCase()));
  if (!launches.length) return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };

  const hooks = launches.map((l: any) => l.hook);
  const escrows = launches.map((l: any) => l.escrow);
  // Each escrow records its paired asset and split once, at launch; they never change.
  const read = (abi: string) => options.api.multiCall({ abi, calls: escrows, permitFailure: true });
  const quotes = await read("address:quoteAsset");
  const platform = await read("uint256:platformBps");
  const creator = await read("uint256:creatorBps");
  const dividend = await read("uint256:dividendBps");
  const burn = await read("uint256:burnBps");
  const liquidity = await read("uint256:liquidityBps");

  const feeLogs = await options.getLogs({ targets: hooks, eventAbi: QUOTE_FEE_TAKEN, flatten: false });

  feeLogs.forEach((logs: any[], i: number) => {
    const quote = quotes[i];
    if (!quote || !logs.length) return;
    const platformBps = BigInt(platform[i] ?? 0);
    const lanes = [creator[i], dividend[i], burn[i], liquidity[i]].map((v) => BigInt(v ?? 0));
    const laneTotal = lanes.reduce((a, b) => a + b, 0n) || BPS;
    for (const log of logs) {
      const fee = BigInt(log.fee);
      const surcharge = BigInt(log.surcharge);
      if (fee > 0n) {
        dailyFees.add(quote, fee, TRADING_FEES);
        // The team Safe takes platformBps of every fee off the top; the creator's split divides the rest.
        const toTreasury = (fee * platformBps) / BPS;
        const rest = fee - toTreasury;
        dailyRevenue.add(quote, toTreasury, FEES_TO_TREASURY);
        dailyProtocolRevenue.add(quote, toTreasury, FEES_TO_TREASURY);
        const [c, d, b] = lanes.map((bps) => (rest * bps) / laneTotal);
        dailySupplySideRevenue.add(quote, c, FEES_TO_CREATORS);
        dailySupplySideRevenue.add(quote, d, FEES_TO_HOLDERS);
        dailySupplySideRevenue.add(quote, b, FEES_TO_BUYBACK);
        dailySupplySideRevenue.add(quote, rest - c - d - b, FEES_TO_LIQUIDITY);
      }
      if (surcharge > 0n) {
        dailyFees.add(quote, surcharge, SNIPE_SURCHARGE);
        dailyRevenue.add(quote, surcharge, SURCHARGE_TO_TREASURY);
        dailyProtocolRevenue.add(quote, surcharge, SURCHARGE_TO_TREASURY);
      }
    }
  });

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "Every swap in a Phlece coin's Uniswap v4 pool pays a 0.98% base fee plus the creator's 1-10% tax, in the coin's paired asset (QuoteFeeTaken events of each coin's hook). Swaps in a coin's first 3 seconds also pay an anti-snipe surcharge. The pool's own LP fee is 0.",
  Revenue: "20% of every trading fee (the portal's platformBps) plus the whole anti-snipe surcharge go to the Phlece team Safe.",
  ProtocolRevenue: "20% of every trading fee plus the anti-snipe surcharge, paid to the Phlece team Safe.",
  SupplySideRevenue: "The other 80% of each trading fee, split by percentages the coin's creator fixed at launch between the creator, the coin's holders (dividends), buyback-and-burn of the coin, and liquidity added to the coin's locked pool position.",
};

const breakdownMethodology = {
  Fees: {
    [TRADING_FEES]: "0.98% base fee plus the creator's 1-10% tax on every swap, in the paired asset.",
    [SNIPE_SURCHARGE]: "Extra charge on swaps in a coin's first 3 seconds (99%, then 6.18%, then 0.19%).",
  },
  Revenue: {
    [FEES_TO_TREASURY]: "20% of each trading fee, to the team Safe.",
    [SURCHARGE_TO_TREASURY]: "The whole anti-snipe surcharge, to the team Safe.",
  },
  ProtocolRevenue: {
    [FEES_TO_TREASURY]: "20% of each trading fee, to the team Safe.",
    [SURCHARGE_TO_TREASURY]: "The whole anti-snipe surcharge, to the team Safe.",
  },
  SupplySideRevenue: {
    [FEES_TO_CREATORS]: "The creator's share of the remaining 80%, claimable by the creator's payout wallet.",
    [FEES_TO_HOLDERS]: "The dividend share, claimable by the coin's holders pro rata.",
    [FEES_TO_BUYBACK]: "Spent buying the coin back from its pool and sending it to 0xdead.",
    [FEES_TO_LIQUIDITY]: "Added to the coin's permanently locked pool position.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-09-28",
  methodology,
  breakdownMethodology,
};

export default adapter;
