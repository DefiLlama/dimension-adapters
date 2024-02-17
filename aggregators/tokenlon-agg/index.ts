import { ChainBlocks, FetchOptions } from "../../adapters/types";

const abis = {  
  "FillOrder": "event FillOrder(string source, bytes32 indexed transactionHash, bytes32 indexed orderHash, address indexed userAddr, address takerAssetAddr, uint256 takerAssetAmount, address makerAddr, address makerAssetAddr, uint256 makerAssetAmount, address receiverAddr, uint256 settleAmount, uint16 feeFactor)",
  "Swapped": "event Swapped(string source, bytes32 indexed transactionHash, address indexed userAddr, address takerAssetAddr, uint256 takerAssetAmount, address makerAddr, address makerAssetAddr, uint256 makerAssetAmount, address receiverAddr, uint256 settleAmount, uint256 receivedAmount, uint16 feeFactor, uint16 subsidyFactor)",
}

const fetch = async (timestamp: number, _: ChainBlocks, { createBalances, getLogs, chain, api }: FetchOptions) => {
  const dailyVolume = createBalances()

  const pmmLogs = await getLogs({ target: '0x8D90113A1e286a5aB3e496fbD1853F265e5913c6', eventAbi: abis.FillOrder, })
  const ammLogs = await getLogs({ target: '0x4a14347083B80E5216cA31350a2D21702aC3650d', eventAbi: abis.Swapped, });
  [pmmLogs, ammLogs].flat().forEach((log: any) => {
    dailyVolume.add(log.makerAssetAddr, log.makerAssetAmount)
  })
  return { timestamp, dailyVolume }
};

const adapter: any = {
  adapter: {
    ethereum: { fetch, start: 1676592000, },
  },
};

export default adapter;
