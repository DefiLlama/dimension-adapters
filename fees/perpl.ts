import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// Perpl Exchange (UUPS proxy) on Monad mainnet
const EXCHANGE = "0x34B6552d57a35a1D042CcAe1951BD1C370112a6F";

// AUSD is 6-decimal; feeCNS values are AUSD in CNS units.

const fetch = async ({ getLogs, createBalances }: FetchOptions) => {
  const dailyFees = createBalances();

  // Each match emits one MakerOrderFilled (maker-side fee) and one
  // TakerOrderFilled (taker-side fee). Summing feeCNS across both gives
  // total fees paid by users on Perpl.
  const makerLogs = await getLogs({
    target: EXCHANGE,
    eventAbi:
      "event MakerOrderFilled(uint256 perpId, uint256 accountId, uint256 orderId, uint256 pricePNS, uint256 lotLNS, uint256 feeCNS, uint256 lockedBalanceCNS, int256 amountCNS, uint256 balanceCNS)",
  });
  const takerLogs = await getLogs({
    target: EXCHANGE,
    eventAbi:
      "event TakerOrderFilled(uint256 entryPricePNS, uint256 collatPricePNS, uint256 pnlPricePNS, uint256 lotLNS, uint256 feeCNS, int256 amountCNS, uint256 balanceCNS)",
  });

  for (const log of makerLogs) {
    dailyFees.addUSDValue(Number(log.feeCNS) / 1e6, METRIC.TRADING_FEES);
  }
  for (const log of takerLogs) {
    dailyFees.addUSDValue(Number(log.feeCNS) / 1e6, METRIC.TRADING_FEES);
  }

  // The Exchange routes fees 50/50 between (a) the per-perp insurance fund and
  // (b) the protocol balance — both are protocol-owned reserves. There are no
  // external LP fee shares to net out, so Revenue = Fees.
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailySupplySideRevenue: 0,
  };
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]:
      "Maker fee (~1.6 bps) and taker fee (~2.8 bps) on filled volume across BTC, MON, ETH, SOL, HYPE perpetual futures.",
  },
  Revenue: {
    [METRIC.TRADING_FEES]:
      "100% of trading fees accrue to the protocol; the Exchange splits each fee 50/50 between the per-perp insurance fund and the protocol balance.",
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]:
      "All trading fees end up in protocol-controlled balances (insurance fund + protocol balance). No external LPs.",
  },
};

const adapter: Adapter = {
  version: 2,
  chains: [CHAIN.MONAD],
  fetch,
  start: "2026-02-15",
  methodology: {
    Fees: "Trading fees paid by users (maker + taker) on Perpl perpetual futures, summed from MakerOrderFilled.feeCNS and TakerOrderFilled.feeCNS emitted by the Exchange contract (0x34B6...12a6F). AUSD is the 6-decimal collateral token.",
    Revenue:
      "100% of trading fees go to the protocol. The Exchange routes each fee 50/50 between the per-perp insurance fund and the protocol balance, both of which are protocol-owned reserves. No external liquidity providers.",
    ProtocolRevenue:
      "Same as Revenue. Internal split (50% insurance / 50% protocol balance) is accounting only — both are protocol reserves.",
  },
  breakdownMethodology,
};

export default adapter;
