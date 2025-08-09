import * as sdk from "@defillama/sdk";
import { CHAIN } from "../helpers/chains";
import { getGraphDimensions2 } from "../helpers/getUniSubgraph";
import { FetchOptions } from "../adapters/types";
import { getUniV2LogAdapter } from "../helpers/uniswap";

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
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('GyZ9MgVQkTWuXGMSd3LXESvpevE8S8aD3uktJh7kbVmc'),
  // [CHAIN.BSC]: sdk.graph.modifyEndpoint('GPRigpbNuPkxkwpSbDuYXbikodNJfurc1LCENLzboWer'),
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('8NiXkxLRT3R22vpwLB4DXttpEf3X1LrKhe4T1tQ3jjbP'),
  //[CHAIN.FANTOM]: sdk.graph.modifyEndpoint('3nozHyFKUhxnEvekFg5G57bxPC5V63eiWbwmgA35N5VK'),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('8nFDCAhdnJQEhQF3ZRnfWkJ6FkRsfAiiVabVn4eGoAZH'),
  // [CHAIN.CELO]: sdk.graph.modifyEndpoint('8roCC7H2tsGYGvxD52QQbUoHXXx77H9tPhNn1qcjB5yj'),
  // [CHAIN.AVAX]: sdk.graph.modifyEndpoint('6VAhbtW5u2sPYkJKAcMsxgqTBu4a1rqmbiVQWgtNjrvT'),
  // [CHAIN.HARMONY]: sdk.graph.modifyEndpoint('FrcJBCCKCYGTLLXJmhppXfPKsNoyod4zqNLjHfXj1KHg'), // index error
  // [CHAIN.MOONRIVER]: sdk.graph.modifyEndpoint('5skUrJzgVm6vXAmdKN7gw4CjYx3pgLDeUeUqVzqLXkWT'),
  // [CHAIN.XDAI]: sdk.graph.modifyEndpoint('4a8hcsttqsmycmmeFcpffGMZhBDU4NhHfyHH6YNcnu7b'),
  // [CHAIN.MOONBEAM]: sdk.graph.modifyEndpoint('3tNHz9aTBa2KUthYZiZZxayYYpxXACverKRrkafhoBru'),
  // [CHAIN.BOBA]: sdk.graph.modifyEndpoint('EC3ZtCpCaV5GyyhyPNHs584wdGA72nud7qcuxWNTfPr4'),
  // [CHAIN.FUSE]: sdk.graph.modifyEndpoint('DcaAUrnx2mWKVQNsVJiuz7zhjoLkvtDUcoq73NdBvbTo'), // index error
  [CHAIN.CORE]: 'https://thegraph.coredao.org/subgraphs/name/sushi-v2/sushiswap-core',
  [CHAIN.BLAST]: 'https://api.goldsky.com/api/public/project_clslspm3c0knv01wvgfb2fqyq/subgraphs/sushiswap/sushiswap-blast/gn',
  [CHAIN.KATANA]: sdk.graph.modifyEndpoint('FYBTPY5uYPZ3oXpEriw9Pzn8RH9S1m7tpNwBwaNMuTNq')
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

const graphsClassic = getGraphDimensions2({
  graphUrls: endpointsClassic,
  totalVolume: {
    factory: "factories",
    field: VOLUME_FIELD,
  },
  feesPercent,
  blacklistTokens
});

const graphsClassicBoba = getGraphDimensions2({
  graphUrls: endpointsClassic,
  totalVolume: {
    factory: "factories",
    field: VOLUME_FIELD,
  },
  feesPercent
});

const graphsClassicETH = getGraphDimensions2({
  graphUrls: endpointsClassic,
  totalVolume: {
    factory: "uniswapFactories",
    field: 'totalVolumeUSD',
  },
  feesPercent
});

const classic = Object.keys(endpointsClassic).reduce(
  (acc, chain) => ({
    ...acc,
    [chain]: {
      fetch: async (options: FetchOptions) => {
        try {
          const call = chain === CHAIN.BOBA ? graphsClassicBoba : [CHAIN.ETHEREUM, CHAIN.KATANA].includes(chain as CHAIN) ? graphsClassicETH : graphsClassic;
          const values = (await call(options));
          const result = {
            dailyVolume: values?.dailyVolume || 0,
            dailyFees: values?.dailyFees || 0,
            dailyUserFees: values?.dailyUserFees || 0,
            dailyProtocolRevenue: values?.dailyProtocolRevenue || 0,
            dailySupplySideRevenue: values?.dailySupplySideRevenue || 0,
            dailyHoldersRevenue: values?.dailyHoldersRevenue || 0,
            dailyRevenue: values?.dailyRevenue || 0,
          };

          Object.entries(result).forEach(([key, value]) => {
            if (Number(value) < 0) throw new Error(`${key} cannot be negative. Current value: ${value}`);
          });

          return result;
        } catch {
          return {
            dailyVolume: 0,
            dailyFees: 0,
            dailyUserFees: 0,
            dailyProtocolRevenue: 0,
            dailySupplySideRevenue: 0,
            dailyHoldersRevenue: 0,
            dailyRevenue: 0,
          }
        }
      },
    },
  }),
  {}
) as any;

// const fantomGraphs =  getChainVolumeWithGasToken2({
//   graphUrls: {
//     [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('3nozHyFKUhxnEvekFg5G57bxPC5V63eiWbwmgA35N5VK')
//   },
//   totalVolume: {
//     factory: "factories",
//     field: 'volumeETH',
//   },
//   priceToken: "coingecko:fantom"
// } as any);

// classic[CHAIN.FANTOM] = {
//   fetch: async (options: FetchOptions) =>   {
//     const values = await fantomGraphs(CHAIN.FANTOM)(options);
//     const vol = Number(values.dailyVolume);
//     if (vol < 0) throw new Error(`Volume cannot be negative. Current value: ${vol}`);

//     const result = {
//       ...values,
//       dailyFees: vol * 0.003,
//       dailyUserFees: vol * 0.003,
//       dailyProtocolRevenue: vol * 0.0005,
//       dailySupplySideRevenue: vol * 0.0025,
//       dailyHoldersRevenue: 0,
//       dailyRevenue: vol * 0.003,
//     };

//     Object.entries(result).forEach(([key, value]) => {
//       if (Number(value) < 0) throw new Error(`${key} cannot be negative. Current value: ${value}`);
//     });

//     return result;
//   },
// }

const getUniV2LogAdapterConfig = {
  userFeesRatio: 1,
  revenueRatio: 1 / 6,
  protocolRevenueRatio: 0,
  holdersRevenueRatio: 1 / 6,
}

classic[CHAIN.FANTOM] = { fetch: getUniV2LogAdapter({ factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4', ...getUniV2LogAdapterConfig }) }
classic[CHAIN.AVAX] = { fetch: getUniV2LogAdapter({ factory: '0xc35dadb65012ec5796536bd9864ed8773abc74c4', ...getUniV2LogAdapterConfig }) }
classic[CHAIN.FUSE] = { fetch: getUniV2LogAdapter({ factory: '0x43eA90e2b786728520e4f930d2A71a477BF2737C', ...getUniV2LogAdapterConfig }) }
classic[CHAIN.HARMONY] = { fetch: getUniV2LogAdapter({ factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4', ...getUniV2LogAdapterConfig }) }

export default {
  start: '2024-04-01',
  methodology: {
    Fees: "SushiSwap charges a flat 0.3% fee",
    UserFees: "Users pay a 0.3% fee on each trade",
    Revenue: "A 0.05% of each trade goes to treasury",
    HoldersRevenue: "Share of swap fee goes to xSUSHI stakers.",
    ProtocolRevenue: "Treasury receives a share of the fees",
    SupplySideRevenue: "Liquidity providers get 5/6 of all trades in their pools"
  },
  version: 2,
  adapter: classic,
}
