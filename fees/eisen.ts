import {
  ChainBlocks,
  FetchOptions,
  FetchResultFees,
  SimpleAdapter,
} from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";

const event_swap =
  "event EisenSwapCompleted(address sender, address fromAssetId, address toAssetId, address receiver, uint256 fromAmount, uint256 toAmount, uint256 expectedToAmount, uint256 fee)";

type ROUTER = {
  [c: string]: string[];
};
const ROUTER_ADDRESS: ROUTER = {
  [CHAIN.BASE]: ["0x14C3B68e5855B60263b10eC0fCE54DE3e28AD880"],
  [CHAIN.BLAST]: ["0xd57Ed7F46D64Ec7b6f04E4A8409D88C55Ef8AA3b"],
  [CHAIN.CORE]: ["0x6bD912872B9e704a70f10226ab01A2Db87D0dd1C"],
  [CHAIN.MODE]: ["0x37Cb37b752DBDcd08A872e7dfec256A216C7144C"],
  [CHAIN.LINEA]: ["0x206168f099013b9eAb979d3520cA00aAD453De55"],
  [CHAIN.MANTLE]: ["0x31d6F212142D3B222EF11c9eBB6AF3569b8442EE"],
  [CHAIN.SCROLL]: ["0xA06568773A247657E7b89BBA465014CF85702093"],
  [CHAIN.TAIKO]: ["0xFA0e9251503DaE51670d10288e6962d63191731d"],
  [CHAIN.ZIRCUIT]: ["0x6bD912872B9e704a70f10226ab01A2Db87D0dd1C"],
};

const graph = (chain: Chain): any => {
  return async (
    timestamp: number,
    _: ChainBlocks,
    { getLogs, createBalances }: FetchOptions
  ): Promise<FetchResultFees> => {
    const router = ROUTER_ADDRESS[chain];
    const dailyFees = createBalances();
    const logs = await getLogs({
      targets: router,
      eventAbi: event_swap,
    });
    logs.forEach((i) => dailyFees.add(i.toAssetId, i.fee));

    return {
      dailyFees: dailyFees,
      dailyRevenue: dailyFees,
      dailyHoldersRevenue: 0,
      dailySupplySideRevenue: 0,
      timestamp,
    };
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BASE]: { fetch: graph(CHAIN.BASE), start: "2024-11-23" },
    [CHAIN.BLAST]: { fetch: graph(CHAIN.BLAST), start: "2024-05-10" },
    [CHAIN.CORE]: { fetch: graph(CHAIN.CORE), start: "2024-10-01" },
    [CHAIN.MODE]: { fetch: graph(CHAIN.MODE), start: "2024-03-17" },
    [CHAIN.LINEA]: { fetch: graph(CHAIN.LINEA), start: "2024-06-18" },
    [CHAIN.MANTLE]: { fetch: graph(CHAIN.MANTLE), start: "2024-05-24" },
    [CHAIN.SCROLL]: { fetch: graph(CHAIN.SCROLL), start: "2023-10-16" },
    [CHAIN.TAIKO]: { fetch: graph(CHAIN.TAIKO), start: "2024-10-01" },
    [CHAIN.ZIRCUIT]: { fetch: graph(CHAIN.ZIRCUIT), start: "2024-12-06" },
  },
};

export default adapter;
