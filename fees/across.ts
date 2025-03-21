import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const abis = {
  FundsDeposited:
    "event FundsDeposited(uint256 amount, uint256 originChainId, uint256 indexed destinationChainId, int64 relayerFeePct, uint32 indexed depositId, uint32 quoteTimestamp, address originToken, address recipient, address indexed depositor, bytes message)",
  V3FundsDeposited:
    "event V3FundsDeposited(address inputToken, address outputToken, uint256 inputAmount, uint256 outputAmount, uint256 indexed destinationChainId, uint32 indexed depositId, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadline, address indexed depositor, address recipient, address exclusiveRelayer, bytes message)",
  FilledRelay:
    "event FilledRelay(uint256 amount, uint256 totalFilledAmount, uint256 fillAmount, uint256 repaymentChainId, uint256 indexed originChainId, uint256 destinationChainId, int64 relayerFeePct, int64 realizedLpFeePct, uint32 indexed depositId, address destinationToken, address relayer, address indexed depositor, address recipient, bytes message, (address recipient, bytes message, int64 relayerFeePct, bool isSlowRelay, int256 payoutAdjustmentPct) updatableRelayData)",
  FilledV3Relay:
    "event FilledV3Relay(address inputToken, address outputToken, uint256 inputAmount, uint256 outputAmount, uint256 repaymentChainId, uint256 indexed originChainId, uint32 indexed depositId, uint32 fillDeadline, uint32 exclusivityDeadline, address exclusiveRelayer, address indexed relayer, address depositor, address recipient, bytes message, (address updatedRecipient, bytes updatedMessage, uint256 updatedOutputAmount, uint8 fillType) relayExecutionInfo)",
};
const topic0_filled_replay_v2 =
  "0x8ab9dc6c19fe88e69bc70221b339c84332752fdd49591b7c51e66bae3947b73c";
const topic0_filled_replay_v3 =
  "0x571749edf1d5c9599318cdbc4e28a6475d65e87fd3b2ddbe1e9a8d5e7a0f0ff7";

const address: any = {
  [CHAIN.ETHEREUM]: "0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5",
  [CHAIN.ARBITRUM]: "0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A",
  [CHAIN.OPTIMISM]: "0x6f26Bf09B1C792e3228e5467807a900A503c0281",
  [CHAIN.POLYGON]: "0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096",
};
const graph = async ({ createBalances, getLogs, chain }: FetchOptions) => {
  const dailyFees = createBalances();
  // const dailyVolume = createBalances();

  const logs_fund_disposit = (
    await getLogs({
      target: address[chain],
      eventAbi: abis.FundsDeposited,
    })
  ).filter((a: any) => Number(a!.destinationChainId) === 288);

  const logs_fund_disposit_v3 = (
    await getLogs({
      target: address[chain],
      eventAbi: abis.V3FundsDeposited,
    })
  ).filter((a: any) => Number(a!.destinationChainId) === 288);

  const logs_filled_replay = await getLogs({
    target: address[chain],
    eventAbi: abis.FilledRelay,
    topic: topic0_filled_replay_v2,
  });

  const logs_filled_replay_v3 = await getLogs({
    target: address[chain],
    eventAbi: abis.FilledV3Relay,
    topic: topic0_filled_replay_v3,
  });

  logs_fund_disposit.map((a: any) => {
    dailyFees.add(a.originToken, Number(a.amount * a.relayerFeePct) / 1e18);
    // dailyVolume.add(a.originToken, Number(a.amount));
  });

  logs_fund_disposit_v3.map((a: any) => {
    dailyFees.add(a.outputToken, Number(a.inputAmount - a.outputAmount));
    // dailyVolume.add(a.outputToken, Number(a.outputAmount));
  });

  logs_filled_replay.map((a: any) => {
    dailyFees.add(
      a.destinationToken,
      (Number(a.amount) * Number(a.relayerFeePct + a.realizedLpFeePct)) / 1e18,
    );
    // dailyVolume.add(a.originToken, Number(a.amount))
  });

  logs_filled_replay_v3.map((a: any) => {
    dailyFees.add(a.outputToken, Number(a.inputAmount - a.outputAmount));
    // dailyVolume.add(a.inputToken, Number(a.inputAmount));
  });

  return {
    dailyFees,
    dailySupplySideRevenue: dailyFees,
    // dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch: graph, start: "2023-04-30" },
    [CHAIN.ARBITRUM]: { fetch: graph, start: "2023-04-30" },
    [CHAIN.OPTIMISM]: { fetch: graph, start: "2023-04-30" },
    [CHAIN.POLYGON]: { fetch: graph, start: "2023-04-30" },
  },
};

export default adapter;
