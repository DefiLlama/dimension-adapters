import ADDRESSES from "../../helpers/coreAssets.json";
import { BreakdownAdapter, ChainBlocks, FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";
import { Chain } from "@defillama/sdk/build/general";
import { getPrices } from "../../utils/prices";

interface IGraph {
  makerAssetAddr: string;
  makerAssetAmount: string;
  makerToken: string;
  makerTokenAmount: string;
}

interface IData {
  fillOrders: IGraph[];
  swappeds: IGraph[];
  filledRFQs: IGraph[];
}

type TEndpoint = {
  [s: string | Chain]: string;
};

const config = {
  [CHAIN.POLYGON]: { exchange: '0xac4F3817a726016fC8254119FC48bE838a21f17F' },
  [CHAIN.ARBITRUM]: { exchange: '0xac4F3817a726016fC8254119FC48bE838a21f17F' },
  [CHAIN.BASE]: { exchange: '0xac4F3817a726016fC8254119FC48bE838a21f17F' },
  [CHAIN.BSC]: { exchange: '0xac4F3817a726016fC8254119FC48bE838a21f17F' },
  [CHAIN.OPTIMISM]: { exchange: '0xac4F3817a726016fC8254119FC48bE838a21f17F' },
  [CHAIN.ERA]: { exchange: '0xC63c379Ae456af9C73Bf81A7D745fAF1d9e180e0' },
}

const endpoints: TEndpoint = {
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/consenlabs/tokenlon-v5-exchange",
};

const fetchVolume = (chain: Chain) => {
  return async (
    __timestamp: number,
    _: ChainBlocks,
    { createBalances, fromTimestamp, toTimestamp }: FetchOptions
  ): Promise<FetchResultVolume> => {
    const dailyVolume = createBalances();
    const query = `
    {
      swappeds(first:1000, where:{timestamp_gte:${fromTimestamp}, timestamp_lte:${toTimestamp}}) {
        makerAssetAddr
        makerAssetAmount
      }
      fillOrders(first:1000, where:{timestamp_gte:${fromTimestamp}, timestamp_lte:${toTimestamp}}) {
        makerAssetAddr
        makerAssetAmount
      }
    }
    `;
    const response: IData = await request(endpoints[chain], query);
    const historicalData: IGraph[] = [...response.fillOrders, ...response.swappeds];
    historicalData.map((e: IGraph) => {
      dailyVolume.add(e.makerAssetAddr, e.makerAssetAmount);
    });

    const rfqv2Query = `{
    filledRFQs(
    first: 9
    orderBy: blockTimestamp
    orderDirection: desc
    where: {blockTimestamp_gte: ${fromTimestamp}, blockTimestamp_lte: ${toTimestamp}}
  ) {
    makerToken
    makerTokenAmount
  }}`
    const rfqV2Response = await request(    "https://subgraph.satsuma-prod.com/61c3dea518e9/imtoken-labs--349710/rfq-v2-subgraph/version/v0.0.1-test-version/api",rfqv2Query)
    const rfqv2Record: IGraph[] = [...rfqV2Response.filledRFQs]
    rfqv2Record.map((e: IGraph) => {
      dailyVolume.add(e.makerToken, e.makerTokenAmount);
    });

    return { dailyVolume, timestamp: toTimestamp };
  };
};

const abis = {
  FillOrder:
    "event FillOrder(string source, bytes32 indexed transactionHash, bytes32 indexed orderHash, address indexed userAddr, address takerAssetAddr, uint256 takerAssetAmount, address makerAddr, address makerAssetAddr, uint256 makerAssetAmount, address receiverAddr, uint256 settleAmount, uint16 feeFactor)",
  Swapped:
    "event Swapped(string source, bytes32 indexed transactionHash, address indexed userAddr, address takerAssetAddr, uint256 takerAssetAmount, address makerAddr, address makerAssetAddr, uint256 makerAssetAmount, address receiverAddr, uint256 settleAmount, uint256 receivedAmount, uint16 feeFactor, uint16 subsidyFactor)",
  FilledRFQ:
    "event FilledRFQ(bytes32 indexed offerHash,address indexed user,address indexed maker,address takerToken,uint256 takerTokenAmount,address makerToken,uint256 makerTokenAmount,address recipient,uint256 settleAmount,uint256 feeFactor)",

  Swap:
    "event Swap(bytes32 indexed swapHash,address indexed maker, address indexed taker,address recipient,address inputToken,uint256 inputAmount,address outputToken,uint256 outputAmount)",
};

const fetch = async (timestamp: number, _: ChainBlocks, { createBalances, getLogs, chain, api }: FetchOptions) => {
  const dailyVolume = createBalances();

  const pmmLogs = await getLogs({ target: "0x8D90113A1e286a5aB3e496fbD1853F265e5913c6", eventAbi: abis.FillOrder });
  const ammLogs = await getLogs({ target: "0x4a14347083B80E5216cA31350a2D21702aC3650d", eventAbi: abis.Swapped });
  const rfqv2Logs = await getLogs({ target: "0x91c986709bb4fe0763edf8e2690ee9d5019bea4a", eventAbi: abis.FilledRFQ });

  [pmmLogs, ammLogs].flat().forEach((log: any) => {
    dailyVolume.add(log.makerAssetAddr, log.makerAssetAmount);
  });
  [rfqv2Logs].flat().forEach((log: any) => {
    dailyVolume.add(log.makerToken, log.makerTokenAmount);
  });
  return { timestamp, dailyVolume };
};

const fetchL2 = async (timestamp: number, _: ChainBlocks, { createBalances, getLogs, chain, api }: FetchOptions) => {
  const dailyVolume = createBalances();
  const ammLogs = await getLogs({ target: config[chain].exchange, eventAbi: abis.Swap });

  [ammLogs].flat().forEach((log: any) => {
    dailyVolume.add(log.inputToken, log.inputAmount);
  });
  return { timestamp, dailyVolume };
};

const adaptersMultiChain : any = {}
adaptersMultiChain[CHAIN.ETHEREUM] = {fetch, start: 1608048000}
Object.keys(config).forEach(chain => {
  adaptersMultiChain[chain] = { fetch: fetchL2, start: 0 }
})

const adapter: BreakdownAdapter = {
  breakdown: {
    tokenlon: {
      [CHAIN.ETHEREUM]: {
        fetch: fetchVolume(CHAIN.ETHEREUM),
        start: 1608216488,
      },
    },
    "tokenlon-agg":adaptersMultiChain,
  },
};

export default adapter;
