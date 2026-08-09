import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// CallPut Controller and FeeDistributor proxies on Base:
// https://basescan.org/address/0xfc61ba50AE7B9C4260C9f04631Ff28D5A2Fa4EB2
// https://basescan.org/address/0x780b6b94C0FfCf8E659727CE421e976C1b6784Bc
const CONTROLLER = "0xfc61ba50AE7B9C4260C9f04631Ff28D5A2Fa4EB2";
const FEE_DISTRIBUTOR = "0x780b6b94C0FfCf8E659727CE421e976C1b6784Bc";
// USD values emitted by Vault and VaultUtils fee events are scaled by 1e30.
const PRICE_PRECISION = 1e30;
// IVaultUtils.PriceType enum: MP = 0, RP = 1.
const RISK_PREMIUM_PRICE_TYPE = 1;

const POSITION_FEE_EVENT =
  "event CollectPositionFees(address indexed account, address indexed token, uint256 feeUsd, uint256 feeAmount, bool indexed isSettle)";
const LIQUIDITY_FEE_EVENT =
  "event CollectFees(address indexed token, uint256 feeUsd, uint256 feeAmount)";
const FEE_REBATE_EVENT =
  "event FeeRebate(address indexed from, address indexed to, address token, uint256 feeRebateAmount, uint256 feeAmount, uint256 afterFeePaidAmount, uint256 tokenSpotPrice, address indexed underlyingAsset, uint256 size, uint256 price, bool isSettle, bool isCopyTrade)";
const PENDING_AMOUNT_EVENT =
  "event NotifyPendingAmount(uint8 indexed priceType, address indexed token, uint256 pendingUsd, uint256 pendingAmount)";

const OPTIONS_FEES = "Options Trading Fees";
const LIQUIDITY_FEES = "Liquidity and Swap Fees";
const RISK_PREMIUM = "Risk Premium";
const OPTIONS_FEES_TO_PROTOCOL = "Options Trading Fees To Protocol";
const LIQUIDITY_FEES_TO_PROTOCOL = "Liquidity and Swap Fees To Protocol";
const OPTIONS_FEES_TO_LPS = "Options Trading Fees To LPs";
const LIQUIDITY_FEES_TO_LPS = "Liquidity and Swap Fees To LPs";
const RISK_PREMIUM_TO_LPS = "Risk Premium To OLPs";
const REFERRAL_REBATES = "Options Fee Rebates To Referrers";
const COPY_TRADING_REBATES = "Options Fee Rebates To Copy Traders";

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
  const liquidityFeeLogs = await options.getLogs({
    targets: vaults,
    eventAbi: LIQUIDITY_FEE_EVENT,
  });
  const rebateLogs = await options.getLogs({
    targets: vaults,
    eventAbi: FEE_REBATE_EVENT,
  });
  const pendingAmountLogs = await options.getLogs({
    targets: vaultUtils,
    eventAbi: PENDING_AMOUNT_EVENT,
  });

  const positionFeesUsd = positionFeeLogs.reduce(
    (sum, log) => sum + Number(log.feeUsd) / PRICE_PRECISION,
    0,
  );
  const liquidityFeesUsd = liquidityFeeLogs.reduce(
    (sum, log) => sum + Number(log.feeUsd) / PRICE_PRECISION,
    0,
  );
  const riskPremiumUsd = pendingAmountLogs.reduce(
    (sum, log) =>
      sum +
      (Number(log.priceType) === RISK_PREMIUM_PRICE_TYPE
        ? Number(log.pendingUsd) / PRICE_PRECISION
        : 0),
    0,
  );

  // CollectPositionFees is emitted after rebates have been deducted. Add each
  // rebate back to gross fees, and classify the payout as supply-side revenue.
  for (const log of rebateLogs) {
    const rebateLabel = log.isCopyTrade ? COPY_TRADING_REBATES : REFERRAL_REBATES;
    dailyFees.add(log.token, log.feeRebateAmount, OPTIONS_FEES);
    dailySupplySideRevenue.add(log.token, log.feeRebateAmount, rebateLabel);
  }

  dailyFees.addUSDValue(positionFeesUsd, OPTIONS_FEES);
  dailyFees.addUSDValue(liquidityFeesUsd, LIQUIDITY_FEES);
  dailyFees.addUSDValue(riskPremiumUsd, RISK_PREMIUM);
  dailySupplySideRevenue.addUSDValue(riskPremiumUsd, RISK_PREMIUM_TO_LPS);

  // Rates sum to 100 in FeeDistributor. Treasury and governance allocations
  // are retained by the protocol; OLP rewards are paid to liquidity providers.
  const olpRewardRate = Number(
    await options.toApi.call({
      target: FEE_DISTRIBUTOR,
      abi: "uint256:olpRewardRate",
    }),
  );
  const lpShare = olpRewardRate / 100;
  const protocolShare = 1 - lpShare;

  dailyRevenue.addUSDValue(
    positionFeesUsd * protocolShare,
    OPTIONS_FEES_TO_PROTOCOL,
  );
  dailyRevenue.addUSDValue(
    liquidityFeesUsd * protocolShare,
    LIQUIDITY_FEES_TO_PROTOCOL,
  );
  dailyProtocolRevenue.addUSDValue(
    positionFeesUsd * protocolShare,
    OPTIONS_FEES_TO_PROTOCOL,
  );
  dailyProtocolRevenue.addUSDValue(
    liquidityFeesUsd * protocolShare,
    LIQUIDITY_FEES_TO_PROTOCOL,
  );
  dailySupplySideRevenue.addUSDValue(
    positionFeesUsd * lpShare,
    OPTIONS_FEES_TO_LPS,
  );
  dailySupplySideRevenue.addUSDValue(
    liquidityFeesUsd * lpShare,
    LIQUIDITY_FEES_TO_LPS,
  );

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.BASE],
  fetch,
  // First production Controller volume event on Base.
  start: "2026-01-30",
  methodology: {
    Fees:
      "Gross options trading fees, liquidity and swap fees, and risk premiums paid by CallPut users. Referral and copy-trading rebates are added back because Vault fee events report the net amount after rebates.",
    Revenue:
      "The share of net fees allocated to the CallPut treasury and governance addresses, based on the FeeDistributor's onchain OLP reward rate.",
    ProtocolRevenue:
      "The share of net fees allocated to the CallPut treasury and governance addresses.",
    SupplySideRevenue:
      "Risk premiums earned by OLP liquidity providers, referral and copy-trading rebates, and any share of net fees allocated by FeeDistributor to OLPs.",
  },
  breakdownMethodology: {
    Fees: {
      [OPTIONS_FEES]:
        "Gross fees charged when users open, close, or settle options positions, including referral and copy-trading rebates.",
      [LIQUIDITY_FEES]:
        "Fees charged when users mint or redeem vault liquidity tokens or swap supported collateral assets.",
      [RISK_PREMIUM]:
        "The execution-price spread relative to mark price charged to options traders and accrued to OLP liquidity providers.",
    },
    Revenue: {
      [OPTIONS_FEES_TO_PROTOCOL]:
        "Net options trading fees allocated to CallPut treasury and governance addresses.",
      [LIQUIDITY_FEES_TO_PROTOCOL]:
        "Net liquidity and swap fees allocated to CallPut treasury and governance addresses.",
    },
    ProtocolRevenue: {
      [OPTIONS_FEES_TO_PROTOCOL]:
        "Net options trading fees allocated to CallPut treasury and governance addresses.",
      [LIQUIDITY_FEES_TO_PROTOCOL]:
        "Net liquidity and swap fees allocated to CallPut treasury and governance addresses.",
    },
    SupplySideRevenue: {
      [REFERRAL_REBATES]: "Options fee rebates paid to referral partners.",
      [COPY_TRADING_REBATES]: "Options fee rebates paid to copy traders.",
      [OPTIONS_FEES_TO_LPS]:
        "Net options trading fees allocated to OLP liquidity providers.",
      [LIQUIDITY_FEES_TO_LPS]:
        "Net liquidity and swap fees allocated to OLP liquidity providers.",
      [RISK_PREMIUM_TO_LPS]:
        "Risk premiums accrued to OLP liquidity providers through VaultUtils pending RP amounts.",
    },
  },
};

export default adapter;
