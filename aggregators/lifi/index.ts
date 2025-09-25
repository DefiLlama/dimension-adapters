import { ethers } from "ethers";
import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { LifiDiamonds, fetchVolumeFromLIFIAPI } from "../../helpers/aggregators/lifi";
import { CHAIN } from "../../helpers/chains";


const LifiSwapEvent = "event LiFiGenericSwapCompleted(bytes32 indexed transactionId, string integrator, string referrer, address receiver, address fromAssetId, address toAssetId, uint256 fromAmount, uint256 toAmount)"
const integrators = ['jumper.exchange', 'transferto.xyz', 'jumper.exchange.gas', 'lifi-gasless-jumper']

const iface = new ethers.Interface([LifiSwapEvent]);

const fetch: any = async (options: FetchOptions): Promise<FetchResultVolume> => {
  if (options.chain === CHAIN.BITCOIN || options.chain === CHAIN.SOLANA) {
    const dailyVolume = await fetchVolumeFromLIFIAPI(options.chain, options.startTimestamp, options.endTimestamp, integrators, [], 'same-chain');
    return {
      dailyVolume: dailyVolume
    };
  }

  const dailyVolume = options.createBalances();
  const logs: any[] = await options.getLogs({
    target: LifiDiamonds[options.chain].id,
    topic: '0x38eee76fd911eabac79da7af16053e809be0e12c8637f156e77e1af309b99537',
    eventAbi: LifiSwapEvent,
    entireLog: true
  });

  logs.forEach((e: any) => {
    const parsedLog = iface.parseLog(e);
    if (!integrators.includes(parsedLog?.args.integrator)) {
      dailyVolume.add(parsedLog?.args.fromAssetId, parsedLog?.args.fromAmount);
    }
  });

  if (LifiDiamonds[options.chain].blacklistTokens) {
    for (const token of (LifiDiamonds[options.chain].blacklistTokens as Array<string>)) {
      dailyVolume.removeTokenBalance(token)
    }
  }

  return { dailyVolume } as any;
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
