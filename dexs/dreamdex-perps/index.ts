import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { addUsdso, subtractUsdso, getTokyoKeeperRewards, getTokyoPerpFeeRecords, getTokyoQuoteVolume } from "../../helpers/dreamdex";

const LABELS = {
  LIQUIDATION_TO_PROTOCOL: "Liquidation Fees To Protocol",
  TRADING_TO_PROTOCOL: "Trading Fees To Protocol",
  LIQUIDATION_TO_KEEPERS: "Liquidation Fees To Keepers",
  MAKER_REBATES: "Maker Rebates",
  FEES_TO_INSURANCE: "Fees To Insurance Fund",
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  addUsdso(dailyVolume, await getTokyoQuoteVolume(options, "PERP"));

  for (const { kind, amount, isRebate, insurancePortion } of await getTokyoPerpFeeRecords(options)) {
    if (isRebate) {
      addUsdso(dailySupplySideRevenue, amount, LABELS.MAKER_REBATES);
      subtractUsdso(dailyRevenue, amount, LABELS.TRADING_TO_PROTOCOL);
      continue;
    }
    const isLiquidation = kind === "LiquidationFee";
    const toInsurance = BigInt(insurancePortion ?? 0);
    addUsdso(dailyFees, amount, isLiquidation ? METRIC.LIQUIDATION_FEES : METRIC.TRADING_FEES);
    addUsdso(dailyRevenue, BigInt(amount) - toInsurance, isLiquidation ? LABELS.LIQUIDATION_TO_PROTOCOL : LABELS.TRADING_TO_PROTOCOL);
    if (toInsurance) addUsdso(dailySupplySideRevenue, toInsurance, LABELS.FEES_TO_INSURANCE);
  }

  for (const keeperReward of await getTokyoKeeperRewards(options)) {
    addUsdso(dailySupplySideRevenue, keeperReward, LABELS.LIQUIDATION_TO_KEEPERS);
    subtractUsdso(dailyRevenue, keeperReward, LABELS.LIQUIDATION_TO_PROTOCOL);
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  // Revenue nets keeper refunds and maker rebates; it goes negative in a window where those exceed the fees charged in it
  // (a keeper refund on a liquidation whose fee was skipped, or rebates paid while taker fees are zero).
  allowNegativeValue: true,
  adapter: {
    [CHAIN.SOMNIA_TOKYO]: {
      fetch,
      start: "2026-11-06", // first perp fill on Tokyo
    },
  },
  methodology: {
    Volume:
      "Perpetual futures trading volume on dreamDEX (Somnia Tokyo), counted once per fill. The USDso notional of every " +
      "perp market is summed from the dreamDEX indexer's hourly candles and valued at the USDso price.",
    Fees: "Fees charged by the dreamDEX perp engine, in USDso: liquidation fees, plus maker and taker trading fees (zero since launch).",
    Revenue: "Perp fees credited to the protocol's fee-recipient Safe, after keeper gas refunds on liquidations, maker rebates and the insurance fund's share.",
    ProtocolRevenue: "Perp fees credited to the protocol's fee-recipient Safe, after keeper gas refunds on liquidations, maker rebates and the insurance fund's share.",
    SupplySideRevenue: "Gas refunds paid out of the liquidation fee to the keepers that execute liquidations, fee rebates paid back to makers, and the share of fees routed to the insurance fund.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.LIQUIDATION_FEES]: "Fee charged on the notional of liquidated positions.",
      [METRIC.TRADING_FEES]: "Maker and taker fees on perp fills (zero since launch).",
    },
    Revenue: {
      [LABELS.LIQUIDATION_TO_PROTOCOL]: "Liquidation fees credited to the protocol fee-recipient Safe, net of the keeper gas refund.",
      [LABELS.TRADING_TO_PROTOCOL]: "Trading fees credited to the protocol fee-recipient Safe, net of maker rebates.",
    },
    ProtocolRevenue: {
      [LABELS.LIQUIDATION_TO_PROTOCOL]: "Liquidation fees credited to the protocol fee-recipient Safe, net of the keeper gas refund.",
      [LABELS.TRADING_TO_PROTOCOL]: "Trading fees credited to the protocol fee-recipient Safe, net of maker rebates.",
    },
    SupplySideRevenue: {
      [LABELS.LIQUIDATION_TO_KEEPERS]: "Gas refund paid to the keeper that executes each liquidation, taken out of the liquidation fee.",
      [LABELS.MAKER_REBATES]: "Fee rebates paid back to makers.",
      [LABELS.FEES_TO_INSURANCE]: "Share of liquidation and trading fees routed to the insurance fund that backstops bad debt.",
    },
  },
};

export default adapter;
