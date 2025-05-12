import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchVolumeFromLIFIAPI, LifiDiamonds } from "../../helpers/aggregators/lifi";


const LifiBridgeEvent = "event LiFiTransferStarted((bytes32 transactionId, string bridge, string integrator, address referrer, address sendingAssetId, address receiver, uint256 minAmount, uint256 destinationChainId, bool hasSourceSwaps, bool hasDestinationCall) bridgeData)"


const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  if (options.chain === CHAIN.BITCOIN || options.chain === CHAIN.SOLANA) {
    const dailyVolume = await fetchVolumeFromLIFIAPI(options.chain, options.startTimestamp, options.endTimestamp);
    return {
      dailyBridgeVolume: dailyVolume
    };
  }

  const dailyVolume = options.createBalances();
  const logs: any[] = await options.getLogs({
    target: LifiDiamonds[options.chain].id,
    topic: '0xcba69f43792f9f399347222505213b55af8e0b0b54b893085c2e27ecbe1644f1',
    eventAbi: LifiBridgeEvent,
  });
  logs.forEach(({ bridgeData: { sendingAssetId, minAmount } }: any) => {
    dailyVolume.add(sendingAssetId, minAmount);
  });

  return { dailyBridgeVolume: dailyVolume } as any;
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.keys(LifiDiamonds).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: { fetch, start: LifiDiamonds[chain].startTime }
    }
  }, {})
};

export default adapter;
