import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const contract_addresses: Record<string, string> = {
  [CHAIN.ETHEREUM]: "0x6352a56caadc4f1e25cd6c75970fa768a3304e64",
  [CHAIN.BSC]: "0x6352a56caadc4f1e25cd6c75970fa768a3304e64",
  [CHAIN.POLYGON]: "0x6352a56caadc4f1e25cd6c75970fa768a3304e64",
  [CHAIN.BASE]: "0x6352a56caadc4f1e25cd6c75970fa768a3304e64",
  [CHAIN.OPTIMISM]: "0x6352a56caadc4f1e25cd6c75970fa768a3304e64",
  [CHAIN.ARBITRUM]: "0x6352a56caadc4f1e25cd6c75970fa768a3304e64",
  [CHAIN.AVAX]: "0x6352a56caadc4f1e25cd6c75970fa768a3304e64",
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const logs = await options.getLogs({
    target: contract_addresses[options.chain],
    eventAbi:
      "event Swapped(address indexed sender,address indexed srcToken,address indexed dstToken,address dstReceiver,uint256 amount,uint256 spentAmount,uint256 returnAmount,uint256 minReturnAmount,uint256 guaranteedAmount,address referrer)",
  });

  logs.forEach((log) => {
    dailyVolume.add(log.dstToken, log.returnAmount);
  });

  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.entries(contract_addresses).reduce((acc, [chain, _]) => {
    return {
      ...acc,
      [chain]: {
        fetch: fetch,
      },
    };
  }, {}),
};

export default adapter;
