import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchVolumeFromLIFIAPI, LifiDiamonds } from "../../helpers/aggregators/lifi";


const LifiSwapEvent = "event LiFiGenericSwapCompleted(bytes32 indexed transactionId, string integrator, string referrer, address receiver, address fromAssetId, address toAssetId, uint256 fromAmount, uint256 toAmount)"
const integrators != ['jumper.exchange', 'transferto.xyz', 'jumper.exchange.gas']

const fetch: any = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const dailyVolume = options.createBalances();
  const logs: any[] = await options.getLogs({
    target: LifiDiamonds[options.chain].id,
    topic: '0x38eee76fd911eabac79da7af16053e809be0e12c8637f156e77e1af309b99537',
    eventAbi: LifiSwapEvent,
  });

  logs.forEach((e: any) => {
    const { bridgeData: { integrator, sendingAssetId, minAmount } } = e;
    if (integrators.includes(integrator)) {
      dailyVolume.add(sendingAssetId, minAmount);
    }
  });

  return { dailySwapVolume: dailyVolume } as any;
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.keys(LifiDiamonds).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: { fetch, start: LifiDiamonds[chain].startTime, }
    }
  }, {})
};

export default adapter;
