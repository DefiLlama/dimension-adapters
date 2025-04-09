import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const event_swap =
  "event EisenSwapCompleted(address indexed sender, address indexed fromAssetId, address indexed toAssetId, address receiver, uint256 fromAmount, uint256 toAmount, uint256 expectedToAmount, uint256 fee)";

type ROUTER = {
  [c: string]: string[];
};
const ROUTER_ADDRESS: ROUTER = {
  [CHAIN.BASE]: ["0x14C3B68e5855B60263b10eC0fCE54DE3e28AD880"],
  [CHAIN.BERACHAIN]: ["0xE53744A85a12FCC38005d180c18f04F8EF0FB719"],
  [CHAIN.BLAST]: ["0xd57Ed7F46D64Ec7b6f04E4A8409D88C55Ef8AA3b"],
  [CHAIN.CORE]: ["0x6bD912872B9e704a70f10226ab01A2Db87D0dd1C"],
  [CHAIN.MODE]: ["0x37Cb37b752DBDcd08A872e7dfec256A216C7144C"],
  [CHAIN.LINEA]: ["0x206168f099013b9eAb979d3520cA00aAD453De55"],
  [CHAIN.MANTLE]: ["0x31d6F212142D3B222EF11c9eBB6AF3569b8442EE"],
  [CHAIN.SCROLL]: ["0xA06568773A247657E7b89BBA465014CF85702093"],
  [CHAIN.TAIKO]: ["0xFA0e9251503DaE51670d10288e6962d63191731d"],
  [CHAIN.ZIRCUIT]: ["0x6bD912872B9e704a70f10226ab01A2Db87D0dd1C"],
  [CHAIN.SONEIUM]: ["0x7E36665858D17FD1CbFd4Fd464d2a3Da49aa3B9d"],
  [CHAIN.HEMI]: ["0x3E257bD80C5e73f9A5D30D3D1a734251c4809Ad4"],
  [CHAIN.ROOTSTOCK]: ["0x7D1820c87BD5e4C231310D45E5f24eb571813738"],
  [CHAIN.BSC]: ["0xf1afD3bbEeFE61042b2B29F42d65F71ac5bC881e"],
  [CHAIN.ARBITRUM]: ["0xf1afD3bbEeFE61042b2B29F42d65F71ac5bC881e"],
};

const fetch = async ({ getLogs, createBalances, chain }: FetchOptions) => {
  const router = ROUTER_ADDRESS[chain];
  const dailyFees = createBalances();
  const logs = await getLogs({
    targets: router,
    eventAbi: event_swap,
  });
  logs.forEach((i) => {
    if (
      i.toAssetId.toLowerCase() ===
      "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE".toLowerCase()
    ) {
      dailyFees.addGasToken(i.fee);
    } else {
      dailyFees.add(i.toAssetId, i.fee);
    }
  });
  return {
    dailyFees: dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: { fetch, start: "2024-11-23" },
    [CHAIN.BERACHAIN]: { fetch, start: "2025-02-06" },
    [CHAIN.BLAST]: { fetch, start: "2024-05-10" },
    [CHAIN.CORE]: { fetch, start: "2024-10-01" },
    [CHAIN.MODE]: { fetch, start: "2024-03-17" },
    [CHAIN.LINEA]: { fetch, start: "2024-06-18" },
    [CHAIN.MANTLE]: { fetch, start: "2024-05-24" },
    [CHAIN.SCROLL]: { fetch, start: "2023-10-16" },
    [CHAIN.TAIKO]: { fetch, start: "2024-10-01" },
    [CHAIN.ZIRCUIT]: { fetch, start: "2024-12-06" },
    [CHAIN.SONEIUM]: { fetch, start: "2024-12-15" },
    [CHAIN.HEMI]: { fetch, start: "2025-03-07" },
    [CHAIN.ROOTSTOCK]: { fetch, start: "2025-03-13" },
    [CHAIN.BSC]: { fetch, start: "2025-04-03" },
    [CHAIN.ARBITRUM]: { fetch, start: "2025-04-08" },
  },
};

export default adapter;
