import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const OFFCHAIN_EXCHANGE = "0x8373C3Aa04153aBc0cfD28901c3c971a946994ab";
const BUILDER_ID_PADDED = "0x" + (900).toString(16).padStart(64, "0");

const fetch = async ({ getLogs }: FetchOptions) => {
  const logs = await getLogs({
    target: OFFCHAIN_EXCHANGE,
    eventAbi:
      "event BuilderFeePayment(bytes32 indexed subaccount, uint32 indexed builder, uint32 indexed productId, bytes32 digest, int128 feeAmount, int128 feeRate, int128 quoteAmount)",
    topics: [null as any, null as any, BUILDER_ID_PADDED],
  });

  let dailyFees = 0;
  let dailyVolume = 0;

  for (const log of logs) {
    const fee = Math.abs(Number(log.feeAmount)) / 1e18;
    const vol = Math.abs(Number(log.quoteAmount)) / 1e18;
    dailyFees += fee;
    dailyVolume += vol;
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyVolume,
  };
};

const methodology = {
  Fees: "Builder fees charged on trades routed through Otomate on Nado (variable rate per trade)",
  Revenue: "100% of builder fees go to Otomate protocol",
  Volume: "Notional trading volume routed through Otomate builder code on Nado",
};

export default {
  version: 2,
  chains: [CHAIN.INK],
  fetch,
  start: "2025-11-15",
  methodology,
  doublecounted: true,
} as Adapter;
