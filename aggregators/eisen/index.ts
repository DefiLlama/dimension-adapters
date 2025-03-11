import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const event_swap =
  "event EisenSwapCompleted(address indexed sender, address indexed fromAssetId, address indexed toAssetId, address receiver, uint256 fromAmount, uint256 toAmount, uint256 expectedToAmount, uint256 fee)";

type TPool = {
  [c: string]: string[];
};

const FEE_COLLECTORS: TPool = {
  [CHAIN.BERACHAIN]: ["0xE53744A85a12FCC38005d180c18f04F8EF0FB719"],
  [CHAIN.SCROLL]: ["0xA06568773A247657E7b89BBA465014CF85702093"],
  [CHAIN.ZIRCUIT]: ["0x6bD912872B9e704a70f10226ab01A2Db87D0dd1C"],
  [CHAIN.LINEA]: ["0x206168f099013b9eAb979d3520cA00aAD453De55"],
  [CHAIN.MANTLE]: ["0x31d6F212142D3B222EF11c9eBB6AF3569b8442EE"],
  [CHAIN.BLAST]: ["0xd57Ed7F46D64Ec7b6f04E4A8409D88C55Ef8AA3b"],
  [CHAIN.BASE]: ["0x14C3B68e5855B60263b10eC0fCE54DE3e28AD880"],
  [CHAIN.CORE]: ["0x6bD912872B9e704a70f10226ab01A2Db87D0dd1C"],
  [CHAIN.BITLAYER]: ["0x5722c0B501e7B9880F9bB13A14217851e45C454f"],
  [CHAIN.CRONOS]: ["0x0C15c845C4A970b284c0dd61Bcf01c4DC1117d0F"],
  [CHAIN.TAIKO]: ["0xFA0e9251503DaE51670d10288e6962d63191731d"],
  [CHAIN.MODE]: ["0x37Cb37b752DBDcd08A872e7dfec256A216C7144C"],
  [CHAIN.SONEIUM]: ["0x7E36665858D17FD1CbFd4Fd464d2a3Da49aa3B9d"],
  [CHAIN.HEMI]: ["0xbc4B0BDA9B091CBa8A72036715fB372B3B509ad1"],
};

const START_BLOCKS = {
  [CHAIN.SCROLL]: 1704067200,
  [CHAIN.ZIRCUIT]: 1704067200,
  [CHAIN.LINEA]: 1704067200,
  [CHAIN.MANTLE]: 1704067200,
  [CHAIN.BLAST]: 1704067200,
  [CHAIN.BASE]: 1704067200,
  [CHAIN.BITLAYER]: 1704067200,
  [CHAIN.CORE]: 1704067200,
  [CHAIN.CRONOS]: 1704067200,
  [CHAIN.TAIKO]: 1704067200,
  [CHAIN.MODE]: 1704067200,
  [CHAIN.BERACHAIN]: 1704067200,
  [CHAIN.SONEIUM]: 1704067200,
  [CHAIN.HEMI]: 1704067200,
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
