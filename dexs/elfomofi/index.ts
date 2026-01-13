import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


const SwapEvent = "event ElfomoTrade(uint256 indexed quoteId, uint256 indexed partnerId, address executor, address receiver, address fromToken, address toToken, uint256 fromAmount, uint256 toAmount)";

const ELFOMOFI_SWAP_ADDRESS = "0xf0f0F0F0FB0d738452EfD03A28e8be14C76d5f73"

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
    const dailyVolume = options.createBalances();

    const logs = await options.getLogs({
        target: ELFOMOFI_SWAP_ADDRESS,
        eventAbi: SwapEvent,
    })

    for (const log of logs) {
        dailyVolume.add(log.fromToken, log.fromAmount);
    }

    return {
        dailyVolume: dailyVolume,
    }
}

const methodology = {
    Volume: "Volume is calculated from the fromAmount of all ElfomoTrade events on the Elfomofi swap contract.",
}

const adapter: SimpleAdapter = {
    version: 2,
    methodology,
    adapter: {
      [CHAIN.BASE]: {
        fetch,
        start: "2025-01-06",
      },
    },
  };
  
  export default adapter;