import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { LifiDiamonds } from "../../helpers/aggregators/lifi";
import { CHAIN } from "../../helpers/chains";

const LifiTransferEvent = "event LiFiTransferStarted((bytes32 transactionId, string bridge, string integrator, address referrer, address sendingAssetId, address receiver, uint256 minAmount, uint256 destinationChainId, bool hasSourceSwaps, bool hasDestinationCall) bridgeData)";
const INTEGRATOR = "nova-p2p";

const fetch = async (options: FetchOptions) => {
  const dailyBridgeVolume = options.createBalances();
  const logs = await options.getLogs({ target: LifiDiamonds[options.chain].id, eventAbi: LifiTransferEvent, maxBlockRange: 10000 });

  for (const { bridgeData } of logs) {
    if (bridgeData.integrator === INTEGRATOR) dailyBridgeVolume.add(bridgeData.sendingAssetId, bridgeData.minAmount);
  }

  return { dailyBridgeVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BSC],
  start: "2026-11-06",
  methodology: {
    BridgeVolume: 'Cross-chain transfers NovaP2P Swap routes through LI.FI under its integrator "nova-p2p", counted on the sending chain at the amount sent to the bridge.',
  },
};

export default adapter;
