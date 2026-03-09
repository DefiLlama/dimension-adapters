import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

const fetch = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, target: '97VmzkjX9w8gMFS2RnHTSjtMEDbifGXBq9pgosFdFnM' })
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: "All trading fees paid by users while using TradeWiz bot.",
    Revenue: "Trading fees are collected by TradeWiz protocol.",
    ProtocolRevenue: "Trading fees are collected by TradeWiz protocol.",
  }
};

export default adapter;
