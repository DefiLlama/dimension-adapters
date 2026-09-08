import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// --- Robinhood mainnet (4663) — sync with packages/config/src/addresses.ts ---
const LAUNCH_FACTORY = "0x3b5e8FE8d61B00b35e021275c96F754424b1B9A8";
const FEE_VAULT = "0x8963d65670838ac4b728A049416BDEc89d6cC776";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

const FEE_ACCRUED =
  "event FeeAccrued(address indexed quoteToken, address indexed launchToken, address indexed payer, address trader, address creator, address referrer, bytes8 referralCode, uint256 receivedAmount, uint256 protocolCredited, uint256 referralCredited, uint256 referralPaid, uint256 safetyCredited, uint256 creatorCredited)";

const CREATE_FEE_COLLECTED =
  "event CreateFeeCollected(address indexed creator, address indexed token, uint256 feeUsdg)";

const LABEL = {
  TRADING: METRIC.TRADING_FEES,
  PROTOCOL: "FeeVault protocol allocation",
  CREATOR: METRIC.CREATOR_FEES,
  REFERRAL: "Referral Fees",
  SAFETY: "Safety Reserve",
  CREATE: "USDG launch creation fee",
} as const;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const feeLogs: any[] = await options.getLogs({
    target: FEE_VAULT,
    eventAbi: FEE_ACCRUED,
  });

  for (const log of feeLogs) {
    const quote = log.quoteToken as string;
    dailyFees.add(quote, log.receivedAmount, LABEL.TRADING);

    dailySupplySideRevenue.add(quote, log.creatorCredited, LABEL.CREATOR);
    // referralCredited = vault credit; referralPaid = auto-payout on accrue (mutually exclusive per accrual leg)
    const referralTotal =
      BigInt(log.referralCredited ?? 0) + BigInt(log.referralPaid ?? 0);
    if (referralTotal > 0n) {
      dailySupplySideRevenue.add(quote, referralTotal, LABEL.REFERRAL);
    }

    dailyRevenue.add(quote, log.protocolCredited, LABEL.PROTOCOL);
    dailyProtocolRevenue.add(quote, log.protocolCredited, LABEL.PROTOCOL);
    dailySupplySideRevenue.add(quote, log.safetyCredited, LABEL.SAFETY);
  }

  const createLogs: any[] = await options.getLogs({
    target: LAUNCH_FACTORY,
    eventAbi: CREATE_FEE_COLLECTED,
  });

  for (const log of createLogs) {
    dailyFees.add(USDG, log.feeUsdg, LABEL.CREATE);
    dailyRevenue.add(USDG, log.feeUsdg, LABEL.CREATE);
    dailyProtocolRevenue.add(USDG, log.feeUsdg, LABEL.CREATE);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Protocol-path trading fees accrued into MerryForgeFeeVault (FeeAccrued.receivedAmount; protocolFeeBps on curve + TradeRouter AMM) plus non-refundable USDG create fees (CreateFeeCollected).",
  UserFees: "Same as Fees for trading and create fees paid by users/creators.",
  Revenue:
    "Protocol shares of FeeVault accruals (protocolCredited) plus create fees. Excludes bond forfeit/slash policy inflows. Creator and referral shares are supply-side (holders/users), not protocol revenue.",
  ProtocolRevenue:
    "Ops-controlled FeeVault allocations: protocolCredited plus create fees to protocolTreasury.",
  SupplySideRevenue:
    "Creator and L1 referral shares from FeeVault (creatorCredited + referralCredited + referralPaid) plus safety reserve share (safetyCredited) which is ops-controlled but benefits the ecosystem (backstop), not protocol treasury income.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.TRADING]:
      "Quote trading fees taken on bonding-curve and TradeRouter AMM paths and accrued via FeeVault.FeeAccrued.receivedAmount.",
    [LABEL.CREATE]:
      "Non-refundable USDG create fee collected at launch create (LaunchFactory.CreateFeeCollected).",
  },
  UserFees: {
    [LABEL.TRADING]:
      "Trading fees paid by traders on curve and official AMM paths.",
    [LABEL.CREATE]: "Create fees paid by launch creators in USDG.",
  },
  Revenue: {
    [LABEL.PROTOCOL]:
      "50% base protocol share of FeeVault accruals (protocolCredited; includes folded referral/creator dust).",
    [LABEL.CREATE]: "Create fees sent to protocolTreasury.",
  },
  ProtocolRevenue: {
    [LABEL.PROTOCOL]:
      "FeeVault protocol allocation (protocolCredited) retained as ops-controlled protocol revenue.",
    [LABEL.CREATE]: "USDG launch creation fee retained by protocol treasury.",
  },
  SupplySideRevenue: {
    [LABEL.CREATOR]:
      "10% creator share of FeeVault accruals (creatorCredited).",
    [LABEL.REFERRAL]:
      "10% L1 referral share (referralCredited vault liability and/or referralPaid auto-payout).",
    [LABEL.SAFETY]:
      "30% safety reserve share of FeeVault accruals (safetyCredited); ops-controlled, not creator claimable, benefits the ecosystem (backstop), not protocol treasury income.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-08-01",
  methodology,
  breakdownMethodology,
};

export default adapter;
