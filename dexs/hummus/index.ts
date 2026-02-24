import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const abi_event = {
  swap: "event Swap(address indexed sender, address fromToken, address toToken, uint256 fromAmount, uint256 toAmount, address indexed to)",
};

const fetch: any = async ({ getLogs, createBalances, }: FetchOptions) => {
  const dailyVolume = createBalances();

  const logs: any[] = await getLogs({ targets:  [
    "0x248fD66e6ED1E0B325d7b80F5A7e7d8AA2b2528b", // main
    "0x5b7e71F6364DA1716c44a5278098bc46711b9516", // mai
    "0x9D73ae2Cc55EC84e0005Bd35Fd5ff68ef4fB8aC5", // busd
    "0x7AA7E41871B06f15Bccd212098DeE98d944786ab", // old
  ], eventAbi: abi_event.swap, })
  logs.forEach((log: any) => dailyVolume.add(log.toToken, Number(log.toAmount)));

  return { dailyVolume, };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.METIS]: {
      fetch,
      start: '2022-08-31',
    },
  },
};

export default adapter;
