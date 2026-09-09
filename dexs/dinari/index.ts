import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// https://github.com/dinaricrypto/sbt-contracts
// https://github.com/dinaricrypto/sbt-contracts/blob/main/releases/v1.0.0/order_processor.json
// v2: https://arbiscan.io/address/0xf60f689ec22fC2D485b3C734eFE58538cCc28766
const V2_PROCESSOR = "0xf60f689ec22fC2D485b3C734eFE58538cCc28766";
const V2_START_TS = 1780790400; // 2026-06-07 — legacy OrderProcessors paused

const config: Record<string, { processor: string; start: string }> = {
  [CHAIN.ETHEREUM]: { processor: "0xA8a48C202AF4E73ad19513D37158A872A4ac79Cb", start: "2024-05-22" },
  [CHAIN.ARBITRUM]: { processor: "0xFA922457873F750244D93679df0d810881E4131D", start: "2024-05-22" },
  [CHAIN.BASE]: { processor: "0x63FF43009f9ba3584aF2Ddfc3D5FE2cb8AE539c0", start: "2024-06-07" },
  [CHAIN.PLUME]: { processor: "0xc1571FEbBb6F8b62eDD0E4694714A382885d6bAB", start: "2025-04-22" },
};

const ORDER_FILL =
  "event OrderFill(uint256 indexed id, address indexed paymentToken, address indexed assetToken, address requester, uint256 assetAmount, uint256 paymentAmount, uint256 feesTaken, bool sell)";

const REQUEST_TOPICS = [
  "0xbd045500f2277c3a6864bc1421e90d6eeb36bb9d1d92c2b7d16cb1d942c90fa3",
  "0xa56a3770fc4f301b41d7919ce30551c6449d44c0954dfc8a8d5e8bb2001588ee",
];
const SETTLED_TOPIC = "0x4907bbdd27eecc3fd5b0202f215bb36933e3601de096474cb7afb6f5c0b4aeb1";

const word = (data: string, i: number) => BigInt(`0x${data.slice(2 + i * 64, 2 + (i + 1) * 64)}`);

const fetch = async (options: FetchOptions) => {
  const { processor } = config[options.chain];
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();

  if (options.startTimestamp < V2_START_TS) {
    const logs = await options.getLogs({ target: processor, eventAbi: ORDER_FILL });
    for (const log of logs as any[]) {
      dailyVolume.add(log.paymentToken, log.paymentAmount);
      dailyFees.add(log.paymentToken, log.feesTaken, METRIC.TRADING_FEES);
    }
  }

  if (options.endTimestamp > V2_START_TS) {
    const [req0, req1, settled] = await Promise.all([
      options.getLogs({ target: V2_PROCESSOR, topics: [REQUEST_TOPICS[0]], entireLog: true }),
      options.getLogs({ target: V2_PROCESSOR, topics: [REQUEST_TOPICS[1]], entireLog: true }),
      options.getLogs({ target: V2_PROCESSOR, topics: [SETTLED_TOPIC], entireLog: true }),
    ]);

    for (const log of [...req0, ...req1] as any[]) {
      const paymentQty = word(log.data, 4); // buys; sells are 0 here
      const fee = word(log.data, 5);
      if (paymentQty > 0n) dailyVolume.addUSDValue(Number(paymentQty) / 1e18);
      if (fee > 0n) dailyFees.addUSDValue(Number(fee) / 1e18, METRIC.TRADING_FEES);
    }

    for (const log of settled as any[]) {
      const usd = Number(word(log.data, 0)) / 1e18;
      if (usd >= 1) dailyVolume.addUSDValue(usd);
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue: dailyFees.clone(),
    dailyProtocolRevenue: dailyFees.clone(),
  };
};

const methodology = {
  Fees: "Trading fees (flat + variable) charged on buy and sell orders of tokenized stocks (dShares).",
  UserFees: "Trading fees (flat + variable) charged on buy and sell orders of tokenized stocks (dShares) are paid by users.",
  Revenue: "Trading fees (flat + variable) charged on buy and sell orders of tokenized stocks (dShares) are revenue.",
  ProtocolRevenue: "Trading fees (flat + variable) charged on buy and sell orders of tokenized stocks (dShares) goes to the protocol.",
  Volume: "Payment-token notional of dShare orders.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Trading fees (flat + variable) charged on buy and sell orders of tokenized stocks (dShares).",
  },
  UserFees: {
    [METRIC.TRADING_FEES]: "Trading fees (flat + variable) charged on buy and sell orders of tokenized stocks (dShares) are paid by users.",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "Trading fees (flat + variable) charged on buy and sell orders of tokenized stocks (dShares) are revenue.",
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]: "Trading fees (flat + variable) charged on buy and sell orders of tokenized stocks (dShares) goes to the protocol.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: config,
  fetch,
  methodology,
  breakdownMethodology,
};

export default adapter;
