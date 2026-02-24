import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const abis = {
  FillOrder:
    'event FillOrder(string source, bytes32 indexed transactionHash, bytes32 indexed orderHash, address indexed userAddr, address takerAssetAddr, uint256 takerAssetAmount, address makerAddr, address makerAssetAddr, uint256 makerAssetAmount, address receiverAddr, uint256 settleAmount, uint16 feeFactor)',
  Swapped:
    'event Swapped(string source, bytes32 indexed transactionHash, address indexed userAddr, address takerAssetAddr, uint256 takerAssetAmount, address makerAddr, address makerAssetAddr, uint256 makerAssetAmount, address receiverAddr, uint256 settleAmount, uint256 receivedAmount, uint16 feeFactor, uint16 subsidyFactor)',
  FilledRFQ:
    'event FilledRFQ(bytes32 indexed offerHash,address indexed user,address indexed maker,address takerToken,uint256 takerTokenAmount,address makerToken,uint256 makerTokenAmount,address recipient,uint256 settleAmount,uint256 feeFactor)',
  FillOrderByRFQ:
    'event FillOrder( string source,bytes32 indexed transactionHash,bytes32 indexed orderHash,address indexed userAddr,address takerAssetAddr,uint256 takerAssetAmount,address makerAddr,address makerAssetAddr,uint256 makerAssetAmount,address receiverAddr,uint256 settleAmount,uint16 feeFactor)',
  SwappedV2:
    'event Swapped((string source, bytes32 transactionHash, uint256 settleAmount, uint256 receivedAmount, uint16 feeFactor, uint16 subsidyFactor), (address makerAddr, address takerAssetAddr, address makerAssetAddr, uint256 takerAssetAmount, uint256 makerAssetAmount, address userAddr, address receiverAddr, uint256 salt, uint256 deadline) order)',
};

const fetchEthereum = async (options: FetchOptions) => {
  const { createBalances, getLogs } = options;
  const dailyVolume = createBalances();

  const pmmLogs = await getLogs({
    target: '0x8D90113A1e286a5aB3e496fbD1853F265e5913c6',
    eventAbi: abis.FillOrder,
  });
  const rfqv1Logs = await getLogs({
    target: '0xfD6C2d2499b1331101726A8AC68CCc9Da3fAB54F',
    eventAbi: abis.FillOrderByRFQ,
  });
  const rfqv2Logs = await getLogs({
    target: '0x91c986709bb4fe0763edf8e2690ee9d5019bea4a',
    eventAbi: abis.FilledRFQ,
  });
  const ammV1Logs = await getLogs({
    target: '0x4a14347083B80E5216cA31350a2D21702aC3650d',
    eventAbi: abis.Swapped,
  });
  const ammV2Logs = await getLogs({
    target: '0x4a14347083B80E5216cA31350a2D21702aC3650d',
    eventAbi: abis.SwappedV2,
  });

  [ammV1Logs, rfqv1Logs, pmmLogs].flat().forEach((log: any) => {
    dailyVolume.add(log.makerAssetAddr, log.makerAssetAmount);
  });

  [ammV2Logs].flat().forEach((log: any) => {
    dailyVolume.add(log.order.makerAssetAddr, log.order.makerAssetAmount);
  });

  [rfqv2Logs].flat().forEach((log: any) => {
    dailyVolume.add(log.makerToken, log.makerTokenAmount);
  });

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchEthereum,
      start: '2020-12-15',
    },
  },
};

export default adapter;
