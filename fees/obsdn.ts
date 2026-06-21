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

  let totalFees = 0;
  let makerRebates = 0;

  for (const log of logs) {
    const maker = Number(log.fees.maker) / X18;
    const taker = Number(log.fees.taker) / X18;
    const liquidation = Number(log.fees.liquidation) / X18;
    const sequencer = Number(log.fees.sequencer) / X18;

    if (maker >= 0) {
      totalFees += maker;
    } else {
      makerRebates += Math.abs(maker);
    }
    totalFees += taker + liquidation + sequencer;
  }

  const dailyFees = totalFees;
  const dailySupplySideRevenue = makerRebates;
  const dailyRevenue = dailyFees - dailySupplySideRevenue;

  return {
    dailyFees,
    dailyUserFees: dailyFees,
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

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.MONAD],
  fetch,
  start: "2026-06-20",
  methodology,
};

export default adapter;
