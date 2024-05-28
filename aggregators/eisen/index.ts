import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const event_swap =
  "event EisenSwapCompleted(address indexed sender, address indexed fromAssetId, address indexed toAssetId, address receiver, uint256 fromAmount, uint256 toAmount, uint256 expectedToAmount, uint256 fee)";

type TPool = {
  [c: string]: string[];
};

type TBlock = {
  [c: string]: number;
};

const FEE_COLLECTORS: TPool = {
  [CHAIN.MODE]: ["0x37Cb37b752DBDcd08A872e7dfec256A216C7144C"],
  [CHAIN.SCROLL]: ["0xA06568773A247657E7b89BBA465014CF85702093"],
  [CHAIN.MANTLE]: ["0x31d6F212142D3B222EF11c9eBB6AF3569b8442EE"],
  [CHAIN.BLAST]: ["0xd57Ed7F46D64Ec7b6f04E4A8409D88C55Ef8AA3b"],
};

const START_BLOCKS = {
  [CHAIN.MODE]: 1704067200,
  [CHAIN.SCROLL]: 1704067200,
  [CHAIN.MANTLE]: 1704067200,
  [CHAIN.BLAST]: 1704067200,
};

async function fetch({ getLogs, createBalances, chain }: FetchOptions) {
  const feeCollectors = FEE_COLLECTORS[chain];
  const dailyVolume = createBalances();
  const logs = await getLogs({ targets: feeCollectors, eventAbi: event_swap });

  logs.forEach((i) => dailyVolume.add(i.toAssetId, i.toAmount));

  return { dailyVolume };
}

const adapter: SimpleAdapter = { adapter: {}, version: 2 };
Object.keys(FEE_COLLECTORS).forEach(
  (chain) => (adapter.adapter[chain] = { fetch, start: START_BLOCKS[chain] })
);

export default adapter;
