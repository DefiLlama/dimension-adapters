import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryEvents } from "../helpers/sui";
import { METRIC } from "../helpers/metrics"

const PROTOCOL_FEE_SHARE = 0.3;
const TLP_FEE_SHARE = 0.7;
const USD_DECIMALS = 1e9;
const CONTRACT_CHANGE_TIME = 1767225600; //2026-01-01
const FUNDING_FEES = "Funding Fees";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const tlpFees = options.createBalances();
  const protocolFees = options.createBalances();

  const minLpEvents = await queryEvents({
    eventType:
      options.startTimestamp < CONTRACT_CHANGE_TIME
        ? "0xe27969a70f93034de9ce16e6ad661b480324574e68d15a64b513fd90eb2423e5::lp_pool::MintLpEvent"
        : "0x9003219180252ae6b81d2893b41d430488669027219537236675c0c2924c94d9::lp_pool::MintLpEvent",
    options,
  });
  for (const parsedJson of minLpEvents) {
    protocolFees.addUSDValue(Number(parsedJson.mint_fee_usd) / USD_DECIMALS, METRIC.MINT_REDEEM_FEES);
  }

  const burnLpEvents = await queryEvents({
    eventType:
      options.startTimestamp < CONTRACT_CHANGE_TIME
        ? "0xe27969a70f93034de9ce16e6ad661b480324574e68d15a64b513fd90eb2423e5::lp_pool::BurnLpEvent"
        : "0x9003219180252ae6b81d2893b41d430488669027219537236675c0c2924c94d9::lp_pool::BurnLpEvent",
    options,
  });
  for (const parsedJson of burnLpEvents) {
    protocolFees.addUSDValue(Number(parsedJson.burn_fee_usd) / USD_DECIMALS, METRIC.MINT_REDEEM_FEES);
  }

  const swapEvents = await queryEvents({
    eventType:
      options.startTimestamp < CONTRACT_CHANGE_TIME
        ? "0xe27969a70f93034de9ce16e6ad661b480324574e68d15a64b513fd90eb2423e5::lp_pool::SwapEvent"
        : "0x9003219180252ae6b81d2893b41d430488669027219537236675c0c2924c94d9::lp_pool::SwapEvent",
    options,
  });
  for (const parsedJson of swapEvents) {
    const token_name = "0x" + parsedJson.from_token_type.name;
    tlpFees.add(token_name, Number(parsedJson.fee_amount) * TLP_FEE_SHARE, METRIC.SWAP_FEES);
    protocolFees.add(token_name, Number(parsedJson.fee_amount) * PROTOCOL_FEE_SHARE, METRIC.SWAP_FEES);
  }

  const withdrawLendingEvents = await queryEvents({
    eventType:
      options.startTimestamp < CONTRACT_CHANGE_TIME
        ? "0xe27969a70f93034de9ce16e6ad661b480324574e68d15a64b513fd90eb2423e5::lp_pool::WithdrawLendingEvent"
        : "0x9003219180252ae6b81d2893b41d430488669027219537236675c0c2924c94d9::lp_pool::WithdrawLendingEvent",
    options,
  });
  for (const parsedJson of withdrawLendingEvents) {
    protocolFees.add("0x" + parsedJson.c_token_type.name, Number(parsedJson.protocol_share), METRIC.DEPOSIT_WITHDRAW_FEES);
    protocolFees.add("0x" + parsedJson.r_token_type.name, Number(parsedJson.reward_protocol_share), METRIC.DEPOSIT_WITHDRAW_FEES);
  }

  const liquidateEvents = await queryEvents({
    eventType:
      options.startTimestamp < CONTRACT_CHANGE_TIME
        ? "0xe27969a70f93034de9ce16e6ad661b480324574e68d15a64b513fd90eb2423e5::trading::LiquidateEvent"
        : "0x9003219180252ae6b81d2893b41d430488669027219537236675c0c2924c94d9::trading::LiquidateEvent",
    options,
  });
  for (const parsedJson of liquidateEvents) {
    const collateral_token = "0x" + parsedJson.collateral_token.name;
    protocolFees.add(collateral_token, Number(parsedJson.realized_liquidator_fee), METRIC.LIQUIDATION_FEES);
    tlpFees.add(collateral_token, Number(parsedJson.realized_value_for_lp_pool), METRIC.LIQUIDATION_FEES);
  }

  const realizeOptionEvents = await queryEvents({
    eventType:
      options.startTimestamp < CONTRACT_CHANGE_TIME
        ? "0xe27969a70f93034de9ce16e6ad661b480324574e68d15a64b513fd90eb2423e5::trading::RealizeOptionPositionEvent"
        : "0x9003219180252ae6b81d2893b41d430488669027219537236675c0c2924c94d9::trading::RealizeOptionPositionEvent",
    options,
  });
  for (const parsedJson of realizeOptionEvents) {
    const collateral_token = "0x" + parsedJson.realize_balance_token_type.name;
    const fee_value = Number(parsedJson.fee_value);
    protocolFees.add(collateral_token, fee_value * PROTOCOL_FEE_SHARE, METRIC.TRADING_FEES);
    tlpFees.add(collateral_token, fee_value * TLP_FEE_SHARE, METRIC.TRADING_FEES);
  }

  const orderFilledEvents = await queryEvents({
    eventType:
      options.startTimestamp < CONTRACT_CHANGE_TIME
        ? "0xe27969a70f93034de9ce16e6ad661b480324574e68d15a64b513fd90eb2423e5::position::OrderFilledEvent"
        : "0x9003219180252ae6b81d2893b41d430488669027219537236675c0c2924c94d9::position::OrderFilledEvent",
    options,
  });
  for (const parsedJson of orderFilledEvents) {
    const collateral_token = "0x" + parsedJson.collateral_token.name;
    const realized_fee = Number(parsedJson.realized_trading_fee) + Number(parsedJson.realized_borrow_fee);
    protocolFees.add(collateral_token, realized_fee * PROTOCOL_FEE_SHARE, METRIC.TRADING_FEES);
    tlpFees.add(collateral_token, realized_fee * TLP_FEE_SHARE, METRIC.TRADING_FEES);
  }

  const realizeFundingEvents = await queryEvents({
    eventType:
      options.startTimestamp < CONTRACT_CHANGE_TIME
        ? "0xe27969a70f93034de9ce16e6ad661b480324574e68d15a64b513fd90eb2423e5::position::RealizeFundingEvent"
        : "0x9003219180252ae6b81d2893b41d430488669027219537236675c0c2924c94d9::position::RealizeFundingEvent",
    options,
  });
  for (const parsedJson of realizeFundingEvents) {
    const collateral_token = "0x" + parsedJson.collateral_token.name;
    const sign = parsedJson.realized_funding_sign ? 1 : -1;
    const realized_funding_fee = Number(parsedJson.realized_funding_fee) * sign;
    tlpFees.add(collateral_token, realized_funding_fee, FUNDING_FEES);
  }

  // === Calculate total fees and revenues ===
  const totalFees = options.createBalances();
  totalFees.addBalances(tlpFees.clone());
  totalFees.addBalances(protocolFees.clone());
  return {
    dailyFees: totalFees,
    dailySupplySideRevenue: tlpFees,
    dailyRevenue: protocolFees,
    dailyProtocolRevenue: protocolFees,
  };
};

const methodology = {
  Fees: "Typus Perp fees are charged from perp trading fees and liquidation fees.",
  Revenue: "30% of perp trading/liquidation fees and all TLP mint/burn fees are included in the revenue.",
  ProtocolRevenue:
    "30% of perp trading/liquidation fees and all TLP mint/burn fees are included in the protocol revenue.",
  SupplySideRevenue: "70% of fees except for mint/burn fees goes to TLP holders (liquidity providers)",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.MINT_REDEEM_FEES]: "Mint and Burn fees based on tokens balance in the pool",
    [METRIC.SWAP_FEES]: "Fees paid on swaps",
    [METRIC.LIQUIDATION_FEES]: "Fees paid on liquidations",
    [METRIC.TRADING_FEES]: "Fees paid on trading",
    [FUNDING_FEES]: "Fees paid on funding",
    [METRIC.DEPOSIT_WITHDRAW_FEES]: "Fees paid on withdrawals",
  },
  Revenue: {
    [METRIC.MINT_REDEEM_FEES]: "All the mint and burn fees are included in the revenue",
    [METRIC.SWAP_FEES]: "30% of the swap fees are included in the revenue",
    [METRIC.LIQUIDATION_FEES]: "30% of the liquidation fees are included in the revenue",
    [METRIC.TRADING_FEES]: "30% of the trading fees are included in the revenue",
    [METRIC.DEPOSIT_WITHDRAW_FEES]: "All the withdrawal fees are revenue",
  },
  ProtocolRevenue: {
    [METRIC.MINT_REDEEM_FEES]: "All the mint and burn fees are included in the protocol revenue",
    [METRIC.SWAP_FEES]: "30% of the swap fees are included in the protocol revenue",
    [METRIC.LIQUIDATION_FEES]: "30% of the liquidation fees are included in the protocol revenue",
    [METRIC.TRADING_FEES]: "30% of the trading fees are included in the protocol revenue",
    [METRIC.DEPOSIT_WITHDRAW_FEES]: "All the withdrawal fees go to protocol",
  },
  SupplySideRevenue: {
    [METRIC.SWAP_FEES]: "70% of the swap fees goes to TLP holders",
    [METRIC.LIQUIDATION_FEES]: "70% of the liquidation fees goes to TLP holders",
    [METRIC.TRADING_FEES]: "70% of the trading fees goes to TLP holders",
    [FUNDING_FEES]: "All the funding fees goes to TLP holders",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: "2025-04-01",
    },
  },
  methodology,
  breakdownMethodology,
  allowNegativeValue: true,
};

export default adapter;
