import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const LIFI_FEE_COLLECTOR: Partial<Record<string, string>> = {
  [CHAIN.ETHEREUM]: "0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9",
  [CHAIN.ARBITRUM]: "0x8021E9F5E4D0C9A08E8b53B4E3776B65b1d89B59",
  [CHAIN.POLYGON]:  "0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9",
  [CHAIN.OPTIMISM]: "0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9",
  [CHAIN.BSC]:      "0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9",
};
const MULTIMESH_INTEGRATOR = "0x552008c0f6870c2f77e5cC1d2eb9bdff03e30Ea0";
const FEES_COLLECTED_EVENT = "event FeesCollected(address indexed _token, address indexed _integrator, uint256 _integratorFee, uint256 _lifiFee)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const logs = await options.getLogs({
    target: LIFI_FEE_COLLECTOR[options.chain] ?? "0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9",
    eventAbi: FEES_COLLECTED_EVENT,
    onlyArgs: true,
  });
  const multimeshLogs = logs.filter(
    (log: any) => log._integrator.toLowerCase() === MULTIMESH_INTEGRATOR.toLowerCase()
  );
  for (const log of multimeshLogs) {
    dailyFees.add(log._token, log._integratorFee + log._lifiFee);
    dailyRevenue.add(log._token, log._integratorFee);
  }
  return { dailyFees, dailyRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM, CHAIN.ARBITRUM, CHAIN.POLYGON, CHAIN.OPTIMISM, CHAIN.BSC],
  start: "2025-03-01",
  methodology: {
    Fees: "Total fees collected on swaps routed through MultiMesh via LI.FI.",
    Revenue: "MultiMesh's 15bps integrator fee on all cross-chain swaps.",
  },
};

export default adapter;
