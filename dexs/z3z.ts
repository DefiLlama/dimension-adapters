import type { SimpleAdapter } from "../adapters/types";
import type { FetchOptions, FetchResultV2, FetchV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const CONRTACTS = [
  '0x6582730C6b5366144c43dcBEfDf4a56e120967D5'
]

// WLD token address on World Chain
const WLD_TOKEN: string = "0x2cFc85d8E48F8EAB294be644d9E25C3030863003".toLowerCase();

const CreatedEvent = 'event GameCreated(string preliminaryGameId, uint256 indexed onChainGameId, address indexed player, uint256 betAmount, bytes32 gameSeedHash)'

const fetch: FetchV2 = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances();

  for (const contractAddr of CONRTACTS) {
    const gameCreatedLogs = await options.getLogs({
      target: contractAddr,
      eventAbi: CreatedEvent,
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
  adapter: {
    [CHAIN.WC]: {
      fetch,
      start: "2025-07-01",
      meta: {
        methodology: {
          Volume: "Sum of volume created in WLD on Z3Z contract",
        },
      },
    },
  },
};

export default adapter;