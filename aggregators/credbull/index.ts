import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const CBL_TGE = 1730973600; // 2024-11-07 10:00 UTC
const CBL_TOKEN = "0xD6b3d81868770083307840F513A3491960b95cb6";
const CBL_TRANSFER_EVENT_ABI = "event Transfer(address indexed from, address indexed to, uint256 value)";

async function fetch(options: FetchOptions): Promise<FetchResultVolume> {
  const dailyVolume = options.createBalances();
  const logs = await options.getLogs({
    target: CBL_TOKEN,
    eventAbi: CBL_TRANSFER_EVENT_ABI,
  });
  logs.map((e: any) => dailyVolume.addToken(CBL_TOKEN, e.value));
  return { dailyVolume, timestamp: Date.now() / 1000 };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch,
      start: CBL_TGE,
    },
  },
};

export default adapter;
