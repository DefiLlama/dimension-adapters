import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const MATCHING = "0x227adD7CDe4E7996D9f02975CC16212f19664C03";
const X18 = 1e18;

const ordersMatchedFeesAbi =
  "event OrdersMatchedFees(uint16 indexed marketIndex, uint64 indexed makerNonce, uint64 indexed takerNonce, (int128 maker, uint128 taker, uint128 liquidation, uint128 sequencer) fees)";

const fetch = async (options: FetchOptions) => {
  const logs = await options.getLogs({
    target: MATCHING,
    eventAbi: ordersMatchedFeesAbi,
  });

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  for (const log of logs) {
    const maker = Number(log.fees.maker) / X18;
    const taker = Number(log.fees.taker) / X18;
    const liquidation = Number(log.fees.liquidation) / X18;
    const sequencer = Number(log.fees.sequencer) / X18;

    if (maker >= 0) {
      dailyFees.addUSDValue(maker, "Maker Fees");
      dailyRevenue.addUSDValue(maker, "Maker Fees");
    } else {
      dailyFees.addUSDValue(Math.abs(maker), "Maker Rebates");
      dailySupplySideRevenue.addUSDValue(Math.abs(maker), "Maker Rebates");
    }

    dailyFees.addUSDValue(taker, "Taker Fees");
    dailyRevenue.addUSDValue(taker, "Taker Fees");

    dailyFees.addUSDValue(liquidation, "Liquidation Fees");
    dailyRevenue.addUSDValue(liquidation, "Liquidation Fees");

    dailyFees.addUSDValue(sequencer, "Sequencer Fees");
    dailyRevenue.addUSDValue(sequencer, "Sequencer Fees");
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Trading fees charged to makers and takers on each trade, plus liquidation and sequencer fees.",
  UserFees: "All fees paid by traders.",
  Revenue: "Trading fees retained by the protocol after maker rebates.",
  ProtocolRevenue: "Trading fees retained by the protocol after maker rebates.",
  SupplySideRevenue: "Maker rebates paid to liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    "Maker Fees": "Trading fees paid by makers.",
    "Maker Rebates": "Rebates paid to makers.",
    "Taker Fees": "Trading fees paid by takers.",
    "Liquidation Fees": "Liquidation fees paid on liquidations.",
    "Sequencer Fees": "Sequencer fees paid on orders.",
  },
  Revenue: {
    "Maker Fees": "Trading fees paid by makers.",
    "Taker Fees": "Trading fees paid by takers.",
    "Liquidation Fees": "Liquidation fees paid on liquidations.",
    "Sequencer Fees": "Sequencer fees paid on orders.",
  },
  ProtocolRevenue: {
    "Maker Fees": "Trading fees paid by makers.",
    "Taker Fees": "Trading fees paid by takers.",
    "Liquidation Fees": "Liquidation fees paid on liquidations.",
    "Sequencer Fees": "Sequencer fees paid on orders.",
  },
  SupplySideRevenue: {
    "Maker Rebates": "Rebates paid to makers.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.MONAD],
  fetch,
  start: "2026-06-20",
  methodology,
  breakdownMethodology,
};

export default adapter;
