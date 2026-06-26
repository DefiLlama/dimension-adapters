import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import fetchURL, { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";
import PromisePool from "@supercharge/promise-pool";

const CONTRACTS = {
  cashback: "0x0a9591c64Fd9e8C1f9A81DB1B668a5f211b5735A",
  vaultV2: "0x026968b5cED079ECCD6CC78f35a5Dfddc13F9Af8",
  billing: "0xF5dA5b918b8c50d211495F4316070Cfc4Fbe128E",
};

// EVEDEX payout vaults distribute 6-decimal USDT.
const USDT_DECIMALS = 1e6;

const URLS = {
  market: "https://trading-api.evedex.com/api/market",
  instruments: "https://trading-api.evedex.com/api/market/instrument",
  ohlcv: "https://market-data-api.evedex.com/api/history",
};

const LABELS = {
  tradingFees: METRIC.TRADING_FEES,
  billingFees: "Billing Fees",
  revenue: "Trading Fees To Protocol",
  billingRevenue: "Billing Fees To Protocol",
  cashbackVault: "Cashback Vault Payouts",
  vaultV2: "VaultV2 Distributions",
};

const EVENT_ABIS = {
  cashback: {
    withdraw: "event CashbackWithdraw(address indexed recipient, uint80 requestId, uint256 amount)",
    crumbs: "event CashbackWithdrawCrumbs(address indexed recipient, uint256 amount)",
  },
  vaultV2: "event Distribute(address indexed account, address indexed token, uint256 amount)",
  billing: "event UserCharged(address indexed user, uint256 amount, string subscriptionId)",
};

const sumAmounts = (logs: any[]) => logs.reduce((sum: number, log: any) => sum + Number(log.amount), 0) / USDT_DECIMALS;

const fetch = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;
  const [market, instruments] = await Promise.all([
    fetchURL(URLS.market),
    fetchURL(URLS.instruments),
  ]);
  const [cashbackWithdrawLogs, cashbackCrumbsLogs, vaultLogs, billingLogs] = await Promise.all([
    options.getLogs({ target: CONTRACTS.cashback, eventAbi: EVENT_ABIS.cashback.withdraw }),
    options.getLogs({ target: CONTRACTS.cashback, eventAbi: EVENT_ABIS.cashback.crumbs }),
    options.getLogs({ target: CONTRACTS.vaultV2, eventAbi: EVENT_ABIS.vaultV2 }),
    options.getLogs({ target: CONTRACTS.billing, eventAbi: EVENT_ABIS.billing }),
  ]);

  const markets = instruments
    .filter((instrument: any) => instrument.type === "perpetual-futures")
    .map((instrument: any) => instrument.name);
  const after = new Date(startTimestamp * 1000).toISOString();
  const before = new Date(endTimestamp * 1000).toISOString();

  // Avoid error handling for easy backfill 
  const { results: volumes } = await PromisePool
    .withConcurrency(2)
    .for(markets)
    .process(async (market) => {
      const candles = await fetchURLAutoHandleRateLimit(`${URLS.ohlcv}/${market}/list?after=${after}&before=${before}&group=1h`);
      return candles
        .filter((candle: any) => candle[0] >= startTimestamp * 1000 && candle[0] < endTimestamp * 1000)
        .reduce((sum: number, candle: any) => sum + Number(candle[5]), 0);
    });

  const oneSidedVolume = volumes.reduce((sum, volume) => sum + volume, 0) / 2;
  const feeRate = Number(market.fees.maker) + Number(market.fees.taker);
  const cashbackVaultPayouts = sumAmounts([...cashbackWithdrawLogs, ...cashbackCrumbsLogs]);
  const vaultV2Payouts = sumAmounts(vaultLogs);
  const tradingFees = oneSidedVolume * feeRate;
  const billingFees = sumAmounts(billingLogs);
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(tradingFees, LABELS.tradingFees);
  dailyFees.addUSDValue(billingFees, LABELS.billingFees);
  dailyRevenue.addUSDValue(tradingFees - (cashbackVaultPayouts + vaultV2Payouts), LABELS.revenue);
  dailyRevenue.addUSDValue(billingFees, LABELS.billingRevenue);
  dailySupplySideRevenue.addUSDValue(cashbackVaultPayouts, LABELS.cashbackVault);
  dailySupplySideRevenue.addUSDValue(vaultV2Payouts, LABELS.vaultV2);

  return {
    dailyUserFees: dailyFees,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Trading fees paid by users on EVEDEX perpetual futures and billing fees charged by EVEDEX.",
  UserFees: "Trading fees paid by users on EVEDEX perpetual futures and billing fees charged by EVEDEX.",
  Revenue: "Trading fees kept by EVEDEX after cashback and VaultV2 payouts, plus billing fees.",
  ProtocolRevenue: "Trading fees kept by EVEDEX after cashback and VaultV2 payouts, plus billing fees.",
  SupplySideRevenue: "USDT cashback/Vault yields paid to users.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.tradingFees]: "Perpetual futures trading fees, estimated from one-sided trading volume and EVEDEX maker/taker fee rates.",
    [LABELS.billingFees]: "Billing fees charged by EVEDEX subscriptions.",
  },
  Revenue: {
    [LABELS.revenue]: "Trading fees retained by EVEDEX after subtracting USDT cashback and VaultV2 payouts.",
    [LABELS.billingRevenue]: "Subscription fees retained by EVEDEX.",
  },
  ProtocolRevenue: {
    [LABELS.revenue]: "Trading fees retained by EVEDEX after subtracting USDT cashback and VaultV2 payouts.",
    [LABELS.billingRevenue]: "Subscription fees retained by EVEDEX.",
  },
  SupplySideRevenue: {
    [LABELS.cashbackVault]: "USDT cashback claimed from CashbackVault.",
    [LABELS.vaultV2]: "USDT yields distributed through VaultV2.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.EVENTUM],
  start: "2025-06-30",
  allowNegativeValue: true, // Cashbacks are claimed by users from the vault; User claims can be > fees collected at times
  methodology,
  breakdownMethodology,
};

export default adapter;
