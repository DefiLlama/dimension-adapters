import { DISABLED_ADAPTER_KEY, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";

const abi_event = {
  swap: "event Swap(address indexed sender, address fromToken, address toToken, uint256 fromAmount, uint256 toAmount, address indexed to)",
};

const fetch: any = async (timestamp: number, _, { getLogs, createBalances, toTimestamp }: FetchOptions) => {
  const dailyVolume = createBalances();

  const logs: any[] = await getLogs({ target: "0x248fD66e6ED1E0B325d7b80F5A7e7d8AA2b2528b", eventAbi: abi_event.swap, })
  logs.forEach((log: any) => dailyVolume.add(log.toToken, Number(log.toAmount)));

  return { dailyVolume, timestamp: toTimestamp, };
};

const adapter: SimpleAdapter = {
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.METIS]: {
      fetch,
      start: 1661900400,
    },
  },
};

export default adapter;
