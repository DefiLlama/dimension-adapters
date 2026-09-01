import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

import { summarizeCallPutFees } from "./logic";

// CallPut Controller proxy on Base:
// https://basescan.org/address/0xfc61ba50AE7B9C4260C9f04631Ff28D5A2Fa4EB2
const CONTROLLER = "0xfc61ba50AE7B9C4260C9f04631Ff28D5A2Fa4EB2";

const POSITION_FEE_EVENT =
  "event CollectPositionFees(address indexed account, address indexed token, uint256 feeUsd, uint256 feeAmount, bool indexed isSettle)";
const PENDING_AMOUNT_EVENT =
  "event NotifyPendingAmount(uint8 indexed priceType, address indexed token, uint256 pendingUsd, uint256 pendingAmount)";

const TRADE_FEES = "Options Trade Fees";
const RISK_PREMIUM = "Risk Premium";
const TRADE_FEES_TO_PROTOCOL = "Options Trade Fees To Protocol";
const RISK_PREMIUM_TO_OLPS = "Risk Premium To OLPs";

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const vaults: string[] = await options.toApi.call({
    target: CONTROLLER,
    abi: "function getVaults() view returns (address[3])",
  });
  const vaultUtils: string[] = await options.toApi.multiCall({
    calls: vaults,
    abi: "address:vaultUtils",
  });

  const positionFeeLogs = await options.getLogs({
    targets: vaults,
    eventAbi: POSITION_FEE_EVENT,
  });
  const pendingAmountLogs = await options.getLogs({
    targets: vaultUtils,
    eventAbi: PENDING_AMOUNT_EVENT,
  });

  const summary = summarizeCallPutFees(positionFeeLogs, pendingAmountLogs);

  dailyFees.addUSDValue(summary.tradeFeesUsd, TRADE_FEES);
  dailyFees.addUSDValue(summary.riskPremiumUsd, RISK_PREMIUM);
  dailyRevenue.addUSDValue(summary.revenueUsd, TRADE_FEES_TO_PROTOCOL);
  dailyProtocolRevenue.addUSDValue(
    summary.revenueUsd,
    TRADE_FEES_TO_PROTOCOL,
  );
  dailySupplySideRevenue.addUSDValue(
    summary.supplySideRevenueUsd,
    RISK_PREMIUM_TO_OLPS,
  );

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees:
    "Options trade fees plus risk-premium execution-price spreads paid by CallPut users.",
  Revenue:
    "Options trade fees collected by CallPut. Risk premium is excluded from revenue and attributed to OLP liquidity providers.",
  ProtocolRevenue:
    "Options trade fees collected by CallPut, excluding risk premium.",
  SupplySideRevenue:
    "Risk premiums accrued to CallPut OLP liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    [TRADE_FEES]:
      "Fees charged when users open, close, or settle options positions.",
    [RISK_PREMIUM]:
      "Execution-price spread relative to mark price charged to options traders.",
  },
  Revenue: {
    [TRADE_FEES_TO_PROTOCOL]:
      "Options trade fees collected by CallPut, excluding risk premium.",
  },
  ProtocolRevenue: {
    [TRADE_FEES_TO_PROTOCOL]:
      "Options trade fees collected by CallPut, excluding risk premium.",
  },
  SupplySideRevenue: {
    [RISK_PREMIUM_TO_OLPS]:
      "Risk premiums accrued to OLP liquidity providers through VaultUtils pending RP amounts.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.BASE],
  fetch,
  // First production Controller fee activity on Base.
  start: "2026-01-30",
  methodology,
  breakdownMethodology,
};

export default adapter;
