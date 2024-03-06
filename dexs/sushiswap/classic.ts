import { Chain } from "@defillama/sdk/build/general";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";
import {
  CHAIN,
} from "../../helpers/chains";
import { getGraphDimensions } from "../../helpers/getUniSubgraph";
import {
  getChainVolumeWithGasToken,
}  from "../../helpers/getUniSubgraphVolume";
import { FetchOptions } from "../../adapters/types";

const blacklistTokens = {
  [CHAIN.ARBITRUM]: [
    "0xb1bc3f4eacc69c663d289516034981c5272e7fa1",//CPT
    "0xfbef65afa44faa7b69c8779d42ffb5d661ac8b25",//ACID
    "0x134781f5ab6014c9d75cbd87bb1654ab7e6bb432",//CPT
    "0x947d54973d908dc76ff415895bf29108d71ceba3",//ACID
    "0xbbb930795e2a974fd95064fa46a5525a7d447fa7",//ACID
    "0xb94ea12476c2591b8f7a1070a7db8e3b0722e00d",//ACID
    "0x7d823eefa4f801b0b9455ebd4fcbacb154e63b22",//CPT
    "0xaa4d8ab8aeafa2273d670d11acc46785346e5cb9",//GPT
    "0x2c347d1c20caebf45908b5f55841b25fd0c943d3",//GPT
    "0x04845e2af405063a6f3590efea87d418ad92ccc4",//ACID
    "0x29c170dfe9994a113fac69bb77708d90bd3d867e",//ACID
    "0xe41ce5d4aa167de4d59f54a5bb984139207c274d",//GPT
    "0xc09d04c474e78b130a8cb636a5132760bece5edf",//CPT
    "0xdc0b4039a0b358eec18dd6be01f690556098582b",//ARBPAD
    "0xb370f370780def161125afdd944e2d26e04e0178",//MZR
    "0xe167cb54d03ab5692e8d917b07f72bb1b177f652",//SPOOL
    "0x312ca799e46b58768aa64d209ae84b7ab5fcbfa1",//MZR Token
    "0x47480a09b270c559e78d30d63b31e694e091614a",//ARBK
    "0x29c170dfe9994a113fac69bb77708d90bd3d867e",//ACID,
    "0xcCbb8003C66BAa30406f08C52E4beE8ab102f65B", // RAM SCAM,
    "0xcdde1105161f32636982e875a608878e3c3c2059", // DZOO,
    "0x19b3a789f07b53F50c59A602B93c32bb5628D4C4", // DAO
    "0x703051e52b999920af1558541efecf2ba0afc690", // RAM SCAM
    "0x3c04d54fb2fded5a046be86dd546befe24abd75d", // RAM SCAM
    "0x28703c9d4bd6d9e1202c7c228b240310b44832b0", // RAM SCAM
    "0xcaf35894504aebd2ea1014a4f73b2c45d3ee12bb", // RAM SCAM
    "0x4e1f0ff2679a16f8c2fcdec5b018b74b71b680c7", // RAM SCAM
    "0xac385feff7633b644aa1e10781d041456e74c876", // RAM SCAM
    "0x45462873fc22842acecf4e165302fefe1d38bdc1", // RAM SCAM
    "0xDC29348A45b9cbEa574ce680bAEE4bf58Dd5B5fD", // RAM SCAM
    "0x02e93ecc531fa25ffcd9b96734813b25f80376f1", // ETHFAI
    "0x82F9C30A8295fD34437C204D388b659FE61cAf90", // ORO
    "0xf842a419bad027e962918ab795964f169f4c1692", // COCO
    "0x52d8ca895d215843886324899d8855a95e60456c", // ARB SCAM
    "0xde204d12c04188c5b069887fc4aed5a61df51496" // MEEET
  ],
  [CHAIN.ETHEREUM]: [
    "0xcbaf9d3e0cae494cd77e49621995062107848a5b"
  ]
}

const endpointsClassic = {
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/sushiswap/exchange",
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/sushiswap/bsc-exchange",
  [CHAIN.POLYGON]: "https://api.thegraph.com/subgraphs/name/sushiswap/matic-exchange",
  //[CHAIN.FANTOM]: "https://api.thegraph.com/subgraphs/name/sushiswap/fantom-exchange",
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/sushiswap/arbitrum-exchange",
  [CHAIN.CELO]: "https://api.thegraph.com/subgraphs/name/sushiswap/celo-exchange",
  [CHAIN.AVAX]: "https://api.thegraph.com/subgraphs/name/sushiswap/avalanche-exchange",
  [CHAIN.HARMONY]: "https://api.thegraph.com/subgraphs/name/sushiswap/harmony-exchange",
  // [CHAIN.MOONRIVER]: "https://api.thegraph.com/subgraphs/name/sushiswap/moonriver-exchange",
  [CHAIN.XDAI]: "https://api.thegraph.com/subgraphs/name/sushiswap/xdai-exchange",
  // [CHAIN.MOONBEAM]: 'https://api.thegraph.com/subgraphs/name/sushiswap/exchange-moonbeam',
  [CHAIN.BOBA]: 'https://api.thegraph.com/subgraphs/name/sushi-v2/sushiswap-boba',
  [CHAIN.FUSE]: 'https://api.thegraph.com/subgraphs/name/sushiswap/exchange-fuse',
};

const VOLUME_FIELD = "volumeUSD";

const feesPercent = {
  type: "volume" as "volume",
  Fees: 0.3,
  UserFees: 0.3,
  Revenue: 0.05,
  HoldersRevenue: 0.05,
  ProtocolRevenue: 0,
  SupplySideRevenue: 0.25
}

const graphsClassic = getGraphDimensions({
  graphUrls: endpointsClassic,
  totalVolume: {
    factory: "factories",
    field: VOLUME_FIELD,
  },
  dailyVolume: {
    factory: "dayData",
    field: VOLUME_FIELD,
  },
  feesPercent,
  blacklistTokens
});

const graphsClassicBoba = getGraphDimensions({
  graphUrls: endpointsClassic,
  totalVolume: {
    factory: "factories",
    field: VOLUME_FIELD,
  },
  dailyVolume: {
    factory: "factoryDaySnapshot",
    field: VOLUME_FIELD,
    dateField: "date"
  },
  feesPercent
});

const startTimeQueryClassic = {
  endpoints: endpointsClassic,
  dailyDataField: "dayDatas",
  volumeField: VOLUME_FIELD,
};

const classic = Object.keys(endpointsClassic).reduce(
  (acc, chain) => ({
    ...acc,
    [chain]: {
      fetch: chain == "boba" ? graphsClassicBoba(chain as Chain) : graphsClassic(chain as Chain),
      start: chain == "boba" ? getStartTimestamp({ ...startTimeQueryClassic, dailyDataField: "factoryDaySnapshots", chain }) : getStartTimestamp({ ...startTimeQueryClassic, chain }),
      meta: {
        methodology: {
          Fees: "SushiSwap charges a flat 0.3% fee",
          UserFees: "Users pay a 0.3% fee on each trade",
          Revenue: "A 0.05% of each trade goes to treasury",
          HoldersRevenue: "None",
          ProtocolRevenue: "Treasury receives a share of the fees",
          SupplySideRevenue: "Liquidity providers get 5/6 of all trades in their pools"
        }
      }
    },
  }),
  {}
) as any;

const fantomGraphs =  getChainVolumeWithGasToken({
  graphUrls: {
    [CHAIN.FANTOM]: "https://api.thegraph.com/subgraphs/name/sushiswap/fantom-exchange"
  },
  totalVolume: {
    factory: "factories",
    field: 'volumeETH',
  },
  dailyVolume: {
    factory: "dayData",
    field: 'volumeETH',
    dateField: "date"
  },
  priceToken: "coingecko:fantom"
} as any);
classic[CHAIN.FANTOM] = {
  fetch: async (options: FetchOptions) =>   {
    const values = await fantomGraphs(CHAIN.FANTOM)(options);
    const vol = Number(values.dailyVolume)
    return {
      ...values,
      dailyFees: vol * 0.003,
      dailyUserFees: vol * 0.003,
      dailyProtocolRevenue: vol * 0.0005,
      dailySupplySideRevenue: vol * 0.0025,
      dailyHoldersRevenue: 0,
      dailyRevenue: vol * 0.003,
    }
  },
  start: 0
}

export default classic
