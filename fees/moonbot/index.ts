import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getETHReceived } from "../../helpers/token";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  await getETHReceived({
    options,
    balances: dailyFees,
    target: "0x61131513C4fF67Bcd3318eb309834D26A3509Cdb",
  })
  const dailyVolume = dailyFees.clone();
  dailyVolume.resizeBy(100);
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyVolume: dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2023-09-16", // Block number from which data can be fetched
  dependencies: [Dependencies.ALLIUM],
};

export default adapter;
