import { FetchOptions } from "../adapters/types";
import ADDRESSES from "./coreAssets.json";
import { METRIC } from "./metrics";

export const DELPHI_START = "2026-04-20";
export const USDC = ADDRESSES.gensyn.USDC;

const GATEWAY = "0x4e4e85c52E0F414cc67eE88d0C649Ec81698d700";
const PRECISION = 10n ** 18n;

export const abi = {
  buy: "event GatewayBuy(address indexed marketProxy, address indexed buyer, uint256 indexed outcomeIdx, uint256 tokensIn, uint256 sharesOut)",
  sell: "event GatewaySell(address indexed marketProxy, address indexed seller, uint256 indexed outcomeIdx, uint256 sharesIn, uint256 tokensOut)",
  getMarket: "function getMarket() view returns (tuple(tuple(uint256 outcomeCount,uint256 k,uint256 tradingFee,uint256 tradingDeadline,uint256 settlementDeadline) config,uint256 initialPool,uint256 pool,uint256 tradingFees,uint256 refund,uint256 sumTerm36,uint256 winningOutcomeIdx))",
  tradingFeesRecipientPct: "uint256:TRADING_FEES_RECIPIENT_PCT",
};

export async function getTrades({ getLogs }: FetchOptions) {
  const buys = await getLogs({ target: GATEWAY, eventAbi: abi.buy });
  const sells = await getLogs({ target: GATEWAY, eventAbi: abi.sell });

  return { buys, sells };
}

export function addTradeVolume(dailyVolume: any, buys: any[], sells: any[]) {
  buys.forEach((buy) => dailyVolume.add(USDC, buy.tokensIn));
  sells.forEach((sell) => dailyVolume.add(USDC, sell.tokensOut));
}

export async function getMarketConfigs({ api }: FetchOptions, marketProxies: string[]) {
  const configs: Record<string, { tradingFee: bigint, recipientPct: bigint }> = {};

  for (const marketProxy of marketProxies) {
    const market = await api.call({ target: marketProxy, abi: abi.getMarket });
    const recipientPct = await api.call({ target: marketProxy, abi: abi.tradingFeesRecipientPct });
    const config = market.config ?? market[0];
    configs[marketProxy] = {
      tradingFee: toBigInt(config.tradingFee ?? config[2]),
      recipientPct: toBigInt(recipientPct),
    };
  }

  return configs;
}

export function getMarketProxies(buys: any[], sells: any[]) {
  return Array.from(new Set(
    [...buys, ...sells].map((trade) => trade.marketProxy.toLowerCase())
  ));
}

export function addTradeFees(
  balances: {
    dailyFees: any,
    dailyRevenue: any,
    dailyProtocolRevenue: any,
    dailySupplySideRevenue: any,
  },
  buys: any[],
  sells: any[],
  configs: Record<string, { tradingFee: bigint, recipientPct: bigint }>
) {
  buys.forEach((buy) => {
    const config = configs[buy.marketProxy.toLowerCase()];
    addFeeBalances(balances, deductFee(toBigInt(buy.tokensIn), config.tradingFee), config.recipientPct);
  });

  sells.forEach((sell) => {
    const config = configs[sell.marketProxy.toLowerCase()];
    addFeeBalances(balances, addFee(toBigInt(sell.tokensOut), config.tradingFee), config.recipientPct);
  });
}

function addFeeBalances(
  { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue }: {
    dailyFees: any,
    dailyRevenue: any,
    dailyProtocolRevenue: any,
    dailySupplySideRevenue: any,
  },
  fee: bigint,
  recipientPct: bigint
) {
  const revenue = fee * recipientPct / PRECISION;
  const supplySideRevenue = fee - revenue;

  dailyFees.add(USDC, fee, METRIC.TRADING_FEES);
  dailyRevenue.add(USDC, revenue, "Trading Fees To Buyback Vault");
  dailyProtocolRevenue.add(USDC, revenue, "Trading Fees To Buyback Vault");
  dailySupplySideRevenue.add(USDC, supplySideRevenue, "Trading Fees To Market Creator");
}

function deductFee(grossAmount: bigint, tradingFee: bigint) {
  assertValidTradingFee(tradingFee);
  const netAmount = grossAmount * (PRECISION - tradingFee) / PRECISION;
  return grossAmount - netAmount;
}

function addFee(netAmount: bigint, tradingFee: bigint) {
  assertValidTradingFee(tradingFee);
  const denominator = PRECISION - tradingFee;
  const grossAmount = (netAmount * PRECISION + denominator - 1n) / denominator;
  return grossAmount - netAmount;
}

function assertValidTradingFee(tradingFee: bigint) {
  if (tradingFee < 0n || tradingFee >= PRECISION) {
    throw new Error(`Invalid Delphi trading fee: ${tradingFee.toString()}`);
  }
}

function toBigInt(value: any) {
  return typeof value === "bigint" ? value : BigInt(value.toString());
}
