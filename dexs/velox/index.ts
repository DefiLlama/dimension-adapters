import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const FACTORY_ADDRESS = "0xa28dBAE4D926067F4c343aA8071e833b04C8b99E";
const PAIR_ADDRESS = "0x07597448E67374D5F4dcc63CA3703f44369bE112";

const pairAbi = {
  "Swap": "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)"
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  
  const logs = await options.getLogs({
    target: PAIR_ADDRESS,
    eventAbi: pairAbi.Swap,
  });

  logs.forEach((log: any) => {
    const amount0In = log.amount0In;
    const amount1In = log.amount1In;

    if (amount0In > 0) {
      dailyVolume.add("base:0x4200000000000000000000000000000000000006", amount0In);
    }
    if (amount1In > 0) {
      dailyVolume.add("base:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", amount1In);
    }
  });

  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2026-03-08",
      meta: {
        methodology: {
          Volume: "Sum of all swap input amounts from Swap events on the Velox DEX pair contracts",
        },
      },
    },
  },
};

export default adapter;
