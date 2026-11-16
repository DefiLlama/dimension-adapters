import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { USDSO, getTokyoPerpFeeRecords, getTokyoQuoteVolume } from "../../helpers/dreamdex";

// dreamDEX perpetuals — on-chain CLOB perps on Somnia Tokyo, margined and settled in USDso.
// The fee engine writes one PerpFeeRecord per charge. Only `LiquidationFee` has been observed so far (maker and taker
// trading fees are zero at launch); any other non-rebate kind is reported as a trading fee, and rebates are fees handed
// back to traders, so they are left out of fees and taken off revenue.
const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyVolume.add(USDSO, await getTokyoQuoteVolume(options, "PERP"), { skipChain: true });

  for (const { kind, amount, isRebate } of await getTokyoPerpFeeRecords(options)) {
    if (isRebate) {
      dailyRevenue.add(USDSO, -BigInt(amount), { skipChain: true, label: "Fee Rebates" });
      continue;
    }
    const label = kind === "LiquidationFee" ? METRIC.LIQUIDATION_FEES : METRIC.TRADING_FEES;
    dailyFees.add(USDSO, amount, { skipChain: true, label });
    dailyRevenue.add(USDSO, amount, { skipChain: true, label });
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
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
    Fees: "Fees charged by the dreamDEX perp engine, in USDso: liquidation fees, plus trading fees once they are switched on (maker and taker fees are zero at launch).",
    Revenue: "All perp fees go to the protocol fee recipient, net of any fee rebates paid back to traders.",
    ProtocolRevenue: "All perp fees go to the protocol fee recipient, net of any fee rebates paid back to traders.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.LIQUIDATION_FEES]: "Fee charged on the notional of liquidated positions.",
      [METRIC.TRADING_FEES]: "Maker and taker fees on perp fills (zero at launch).",
    },
    Revenue: {
      [METRIC.LIQUIDATION_FEES]: "Liquidation fees kept by the protocol.",
      [METRIC.TRADING_FEES]: "Trading fees kept by the protocol.",
      "Fee Rebates": "Fees paid back to traders, deducted from revenue.",
    },
  },
};

export default adapter;
