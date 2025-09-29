import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const event_swap = "event EisenSwapCompleted(address indexed sender, address indexed fromAssetId, address indexed toAssetId, address receiver, uint256 fromAmount, uint256 toAmount, uint256 expectedToAmount, uint256 fee)";

const chainConfig: Record<string, { start: string, fee: string }> = {
  [CHAIN.BASE]: { start: "2024-11-23", fee: '0x14C3B68e5855B60263b10eC0fCE54DE3e28AD880' },
  [CHAIN.BERACHAIN]: { start: "2025-02-06", fee: '0xE53744A85a12FCC38005d180c18f04F8EF0FB719' },
  [CHAIN.BLAST]: { start: "2024-05-10", fee: '0xd57Ed7F46D64Ec7b6f04E4A8409D88C55Ef8AA3b' },
  [CHAIN.CORE]: { start: "2024-10-01", fee: '0x6bD912872B9e704a70f10226ab01A2Db87D0dd1C' },
  [CHAIN.MODE]: { start: "2024-03-17", fee: '0x37Cb37b752DBDcd08A872e7dfec256A216C7144C' },
  [CHAIN.LINEA]: { start: "2024-06-18", fee: '0x206168f099013b9eAb979d3520cA00aAD453De55' },
  [CHAIN.MANTLE]: { start: "2024-05-24", fee: '0x31d6F212142D3B222EF11c9eBB6AF3569b8442EE' },
  [CHAIN.SCROLL]: { start: "2023-10-16", fee: '0xA06568773A247657E7b89BBA465014CF85702093' },
  [CHAIN.TAIKO]: { start: "2024-10-01", fee: '0xFA0e9251503DaE51670d10288e6962d63191731d' },
  [CHAIN.ZIRCUIT]: { start: "2024-12-06", fee: '0x6bD912872B9e704a70f10226ab01A2Db87D0dd1C' },
  [CHAIN.SONEIUM]: { start: "2024-12-15", fee: '0x7E36665858D17FD1CbFd4Fd464d2a3Da49aa3B9d' },
  [CHAIN.HEMI]: { start: "2025-03-07", fee: '0x3E257bD80C5e73f9A5D30D3D1a734251c4809Ad4' },
  [CHAIN.ROOTSTOCK]: { start: "2025-03-13", fee: '0x7D1820c87BD5e4C231310D45E5f24eb571813738' },
  [CHAIN.BSC]: { start: "2025-04-03", fee: '0xf1afD3bbEeFE61042b2B29F42d65F71ac5bC881e' },
  [CHAIN.ARBITRUM]: { start: "2025-04-08", fee: '0xf1afD3bbEeFE61042b2B29F42d65F71ac5bC881e' },
  [CHAIN.HYPERLIQUID]: { start: "2025-05-18", fee: '0x1FA40f83c12E48e9396d12Dd08B4b4ee51C8c803' },
  [CHAIN.ABSTRACT]: { start: "2025-05-22", fee: '0x82808C2F5777b816d55FCf54928567a50D18E31d' },
  [CHAIN.PLUME]: { start: "2025-06-10", fee: '0x90BA9922Ae475D0DD91a6BF20dcD0FB872Bc18B0' },
  [CHAIN.FLOW]: { start: "2025-08-03", fee: '0x90BA9922Ae475D0DD91a6BF20dcD0FB872Bc18B0' },
  [CHAIN.KATANA]: { start: "2025-07-20", fee: '0x11145aA7EeF8A3c61fFEf3F74981755e3148D358' },
  [CHAIN.BITLAYER]: { start: "2025-08-03", fee: '0x5722c0B501e7B9880F9bB13A14217851e45C454f' },
  [CHAIN.CRONOS]: { start: "2025-08-03", fee: '0x0C15c845C4A970b284c0dd61Bcf01c4DC1117d0F' },
}

async function fetch(options: FetchOptions) {
  const feeCollectors = chainConfig[options.chain].fee;
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const logs = await options.getLogs({ targets: [feeCollectors], eventAbi: event_swap });

  logs.forEach((i) => {
    if (i.toAssetId.toLowerCase() == ADDRESSES.GAS_TOKEN_2.toLowerCase()) {
      dailyVolume.addGasToken(i.toAmount);
      dailyFees.addGasToken(i.fee);
    } else {
      dailyVolume.add(i.toAssetId, i.toAmount);
      dailyFees.add(i.toAssetId, i.fee);
    }
  });

  return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, dailyHoldersRevenue: '0' };
}

const methodology = {
  Fees: "Token trading fees paid by users.",
  Revenue: "All fees are revenue.",
  ProtocolRevenue: "All fees are protocol revenue.",
  HoldersRevenue: "No Holders Revenue",
}

const adapter = {
  version: 2,
  methodology,
  fetch,
  adapter: chainConfig
}

export default adapter;
