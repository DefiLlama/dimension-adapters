import ADDRESSES from '../helpers/coreAssets.json'
import type { SimpleAdapter } from "../adapters/types";
import type { FetchOptions, FetchResultV2, FetchV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const CONRTACTS = [
  '0x68f571e43C8d96e40c2DAdb69f4a13749D563095', // old
  '0xfD724468e9913d0EBb37AB4D06E42Ca0CDd38eeE', // new
]

// WLD token address used by X3XGame (all bets and payouts are in WLD)
const WLD_TOKEN: string = ADDRESSES.wc.WLD.toLowerCase();

const GameCreatedEvent = 'event GameCreated(string preliminaryGameId, uint256 indexed onChainGameId, address indexed player, uint256 betAmount, bytes32 gameSeedHash)'

const fetch: FetchV2 = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances();

  for (const contractAddr of CONRTACTS) {
    const gameCreatedLogs = await options.getLogs({
      target: contractAddr,
      eventAbi: GameCreatedEvent,
    });

    for (const log of gameCreatedLogs) {
      dailyVolume.add(WLD_TOKEN, log.betAmount);
    }
  }

  return {
    dailyVolume
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.WC]: {
      start: "2025-06-01",
    },
  },
  methodology: {
    Volume: "Sum of bets (GameCreated) in WLD across X3X contracts",
  },
};

export default adapter;