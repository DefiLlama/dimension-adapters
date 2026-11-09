import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Sprivio — bonding-curve launchpad deployed on four chains with the same contracts.
// Every constant below was read live from the deployed factory/curve on 2026-09-21
// rather than copied from source (see PR description for the raw eth_call output):
//   factory.FEE_BPS()                     -> 100    (1% base fee on curve trades)
//   factory.CREATOR_FEE_SHARE_BPS()       -> 7000   (creator keeps 70% of the base fee)
//   factory.EARLY_CREATOR_FEE_SHARE_BPS() -> 9000   (90% for the first 100 launches per chain)
//   curve.GRADUATION_FEE_BPS()            -> 200    (2% of the raise, taken at graduation)
//   curve.SNIPE_TAX_PLATFORM_SHARE_BPS()  -> 5000   (anti-snipe tax split 50/50)
//
// Fee split, straight from BondingCurve.sol:
//   fee = quoteIn * feeBps / 10000  +  creatorTax  +  snipeTax
//     base fee  -> split by the curve's own creatorFeeShareBps (creator / protocol)
//     creatorTax-> 100% to the creator
//     snipeTax  -> 50/50 protocol / creator (only non-zero in the first 3 seconds)
// The curve exposes feeBps / creatorTaxBps / creatorFeeShareBps as public immutables,
// so each component is reconstructed exactly from the event's quoteIn instead of guessed.
//
// Balances are NOT read from the curve's platformFees()/creatorFees() counters:
// claimPlatformFees() zeroes them, so a diff between two timestamps would go negative
// after any withdrawal. Everything below is derived from events only.

const LAUNCHED_EVENT =
  "event Launched(address indexed token, address indexed curve, address indexed creator, uint256 supplyWhole, uint16 creatorBps, uint256 virtualQuote, uint256 graduationTarget)";
const BOUGHT_EVENT =
  "event Bought(address indexed buyer, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 priceAfter)";
const SOLD_EVENT =
  "event Sold(address indexed seller, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 priceAfter)";
const GRADUATED_EVENT =
  "event Graduated(uint256 realQuoteAtGraduation, uint256 tokensLeft)";

const LAUNCH_FEE_ABI = "function launchFee() view returns (uint256)";
const FEE_BPS_ABI = "function feeBps() view returns (uint16)";
const CREATOR_TAX_BPS_ABI = "function creatorTaxBps() view returns (uint16)";
const CREATOR_SHARE_BPS_ABI = "function creatorFeeShareBps() view returns (uint16)";

const BPS = 10000n;
const GRADUATION_FEE_BPS = 200n;
const SNIPE_TAX_PLATFORM_SHARE_BPS = 5000n;

const CURVE_TRADE_FEES = "Curve Trade Fees";
const LAUNCH_FEES = "Launch Fees";
const GRADUATION_FEES = "Graduation Fees";

// One deployment per chain. `factories` lists every factory ever used on that chain —
// older ones stay listed because the curves they created are still live and still
// charge fees. `start` is the deploy block of the first factory on that chain.
const CONFIG: Record<string, { factories: string[]; fromBlock: number; start: string }> = {
  [CHAIN.ROBINHOOD]: {
    factories: [
      "0x5ab106E62BA24EB4D28D88FaD5430F0942206cDA",
      "0x1726F45255a39C658A8d59358F79e5bD54Df0F35",
      "0x32dEF68702844285E2A2086245a23A64eAdEdF42",
    ],
    fromBlock: 68088553,
    start: "2026-09-18",
  },
  [CHAIN.BASE]: { factories: ["0xeDAf3D78d68a40b4580Af9aa0ed1E9E63b32c0F6"], fromBlock: 51521370, start: "2026-09-18" },
  [CHAIN.BSC]: { factories: ["0xeDAf3D78d68a40b4580Af9aa0ed1E9E63b32c0F6"], fromBlock: 122822195, start: "2026-09-18" },
  [CHAIN.ARC]: { factories: ["0x542B7c6f2a79315768b1B089214d84150bBB7f1b"], fromBlock: 21690478, start: "2026-09-18" },
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const cfg = CONFIG[options.chain];
  if (!cfg) return { dailyFees, dailyRevenue, dailySupplySideRevenue };

  // Every curve ever created on this chain, across all factory versions.
  const allLaunchLogs = await options.getLogs({
    targets: cfg.factories,
    eventAbi: LAUNCHED_EVENT,
    fromBlock: cfg.fromBlock,
    cacheInCloud: true,
  });
  const curves: string[] = allLaunchLogs.map((log: any) => log.curve);

  // Launch fees: charged per launch in this window and forwarded straight to the
  // platform address by the factory, so they are 100% protocol revenue.
  // Re-read from the contract rather than hardcoded — it differs per chain
  // (0.0005 ETH / 0.002 BNB / 0.25 USDC) and is set at deploy time.
  const todayLaunchesPerFactory = await options.getLogs({
    targets: cfg.factories,
    eventAbi: LAUNCHED_EVENT,
    flatten: false,
  });
  const launchFees = await options.api.multiCall({ abi: LAUNCH_FEE_ABI, calls: cfg.factories });
  todayLaunchesPerFactory.forEach((log: any, i: number) => {
    const count = BigInt(log.length);
    if (!count) return;
    const amount = BigInt(launchFees[i]) * count;
    dailyFees.addGasToken(amount, LAUNCH_FEES);
    dailyRevenue.addGasToken(amount, LAUNCH_FEES);
  });

  if (curves.length) {
    // Per-curve immutables, needed to split each trade's fee into its three parts.
    const [boughtLogs, soldLogs, gradLogs, feeBpsList, creatorTaxBpsList, creatorShareBpsList] =
      await Promise.all([
        options.getLogs({ targets: curves, eventAbi: BOUGHT_EVENT, flatten: false }),
        options.getLogs({ targets: curves, eventAbi: SOLD_EVENT, flatten: false }),
        options.getLogs({ targets: curves, eventAbi: GRADUATED_EVENT, flatten: false }),
        options.api.multiCall({ abi: FEE_BPS_ABI, calls: curves }),
        options.api.multiCall({ abi: CREATOR_TAX_BPS_ABI, calls: curves }),
        options.api.multiCall({ abi: CREATOR_SHARE_BPS_ABI, calls: curves }),
      ]);

    curves.forEach((_, i) => {
      const feeBps = BigInt(feeBpsList[i]);
      const creatorTaxBps = BigInt(creatorTaxBpsList[i]);
      const creatorShareBps = BigInt(creatorShareBpsList[i]);

      const settle = (gross: bigint, fee: bigint, withSnipeTax: boolean) => {
        if (fee === 0n) return;
        const baseFee = (gross * feeBps) / BPS;
        const creatorTax = (gross * creatorTaxBps) / BPS;
        // Whatever is left is the anti-snipe tax. Clamped at 0 so a rounding
        // mismatch can never turn into negative revenue.
        const snipeTax = withSnipeTax && fee > baseFee + creatorTax ? fee - baseFee - creatorTax : 0n;

        const creatorBase = (baseFee * creatorShareBps) / BPS;
        const snipeToProtocol = (snipeTax * SNIPE_TAX_PLATFORM_SHARE_BPS) / BPS;

        const toProtocol = baseFee - creatorBase + snipeToProtocol;
        const toCreator = creatorBase + creatorTax + (snipeTax - snipeToProtocol);

        dailyFees.addGasToken(toProtocol + toCreator, CURVE_TRADE_FEES);
        dailyRevenue.addGasToken(toProtocol, CURVE_TRADE_FEES);
        dailySupplySideRevenue.addGasToken(toCreator, METRIC.CREATOR_FEES);
      };

      // Buy: quoteIn is the gross amount paid in; snipe tax only applies here.
      for (const log of boughtLogs[i] || []) {
        settle(BigInt(log.quoteIn), BigInt(log.fee), true);
      }
      // Sell: quoteOut is net of the fee, so gross = quoteOut + fee.
      for (const log of soldLogs[i] || []) {
        const fee = BigInt(log.fee);
        settle(BigInt(log.quoteOut) + fee, fee, false);
      }
      // Graduation: 2% of the amount actually raised, 100% to the protocol.
      for (const log of gradLogs[i] || []) {
        const gradFee = (BigInt(log.realQuoteAtGraduation) * GRADUATION_FEE_BPS) / BPS;
        if (!gradFee) continue;
        dailyFees.addGasToken(gradFee, GRADUATION_FEES);
        dailyRevenue.addGasToken(gradFee, GRADUATION_FEES);
      }
    });
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "1% base fee on every bonding-curve buy and sell, plus the creator's optional tax, plus the anti-snipe tax charged in the first 3 seconds of a launch, plus a flat launch fee per token (read live from each chain's factory), plus 2% of the raise taken when a curve graduates to Uniswap v4.",
  Revenue: "The protocol's share of the base curve fee (10% normally, 30% once a chain is past its first 100 launches), half of the anti-snipe tax, all launch fees, and the full 2% graduation fee.",
  ProtocolRevenue: "The protocol's share of the base curve fee (10% normally, 30% once a chain is past its first 100 launches), half of the anti-snipe tax, all launch fees, and the full 2% graduation fee.",
  SupplySideRevenue: "The launch creator's share of the base curve fee (90% for the first 100 launches on a chain, 70% after), their full optional creator tax, and half of the anti-snipe tax charged on their token.",
};

const breakdownMethodology = {
  Fees: {
    [CURVE_TRADE_FEES]: "Base fee, creator tax and anti-snipe tax on bonding-curve buys and sells, reconstructed from each event's quoteIn and the curve's own immutable bps settings.",
    [LAUNCH_FEES]: "Flat fee per launch, re-read from each factory since it differs per chain.",
    [GRADUATION_FEES]: "2% of the raise, charged once when a curve graduates into a Uniswap v4 pool.",
  },
  Revenue: {
    [CURVE_TRADE_FEES]: "Protocol's share of the base curve fee plus half of the anti-snipe tax.",
    [LAUNCH_FEES]: "All launch fees; the factory forwards them to the platform address on launch.",
    [GRADUATION_FEES]: "The full graduation fee.",
  },
  SupplySideRevenue: {
    [METRIC.CREATOR_FEES]: "Creator's share of the base curve fee, their full creator tax, and half of the anti-snipe tax on their token.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: CONFIG,
  methodology,
  breakdownMethodology,
  pullHourly: true,
};

export default adapter;
