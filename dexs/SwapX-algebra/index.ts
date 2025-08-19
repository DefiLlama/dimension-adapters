import { CHAIN } from "../../helpers/chains";
import request, { gql } from "graphql-request";
import {
  FetchOptions,
  SimpleAdapter,
  FetchResultVolume,
  FetchResultFees,
} from "../../adapters/types";
import BigNumber from "bignumber.js";

export const SWAPX_GRAPHQL_ENDPOINT =
  "https://subgraph.satsuma-prod.com/fd5b99ed1c6a/swapx--800812/swapx-big/api";

type Feed = "volumeUSD" | "feesUSD";

export const fetchSwapXV3Data = async (
  timestamp: number,
  _: any,
  options: FetchOptions,
  feedKey: Feed
): Promise<FetchResultVolume | FetchResultFees> => {
  const query = gql`
    {
        v3PoolDayDatas(where:{pool_in: ${whitelistedSwapXV3Pools}, date:${options.startOfDay}}) {
            pool {
                id
            }
            ${feedKey}
        }
        v3Pools(where:{id_in: ${whitelistedSwapXV3Pools}}) {
            ${feedKey}
        }
    }`;

  const req = await request(SWAPX_GRAPHQL_ENDPOINT, query);
  let dailyUSD = "0";
  req.v3PoolDayDatas.map((d) => {
    dailyUSD = new BigNumber(dailyUSD).plus(d[feedKey]).toString();
  });

  let totalUSD = "0";
  req.v3Pools.map((d) => {
    totalUSD = new BigNumber(totalUSD).plus(d[feedKey]).toString();
  });

  return feedKey == "volumeUSD"
    ? {
        dailyVolume: dailyUSD,
        timestamp,
      }
    : {
        timestamp,
        dailyFees: dailyUSD,
      };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SONIC]: {
      fetch: (t, _, o) => fetchSwapXV3Data(t, _, o, "volumeUSD"),
      start: "2024-12-24",
    },
  },
};

export const whitelistedSwapXV3Pools =
  '["0xd760791b29e7894fb827a94ca433254bb5afb653", "0x5c4b7d607aaf7b5cde9f09b5f03cf3b5c923aeea", "0x0d13400cc7c46d77a43957fe614ba58c827dfde6", "0xec4ee7d6988ab06f7a8daaf8c5fdffde6321be68", "0xa76beaf111bad5dd866fa4835d66b9aa2eb1fdec", "0x5ddbef774488cc68266d5f15bfb08eaa7cd513f9", "0xdd35c88b1754879ef86bbf3a24f81fcca5eb6b5d", "0xf58fc088c33ad46113940173cb0da3dd08c4aa88", "0xb73a4d63fa27eb0ded5305c5d4d1ce488edfe2a1", "0xda2fddeb3d654e1f32e2664d8d95c9329e34e5c8", "0x84ea9fafd41abaec5a53248f79fa05ada0058a96", "0x63a66dd60b0f2812249802477ada8a890a030eca", "0xfc64bd7c84f7dc1387d6e752679a533f22f6f1db", "0x467865e7ce29e7ed8f362d51fd7141117b234b44", "0x6f7c5f531024216cd8156d0b4e271e0c92a8a4e6", "0xbeca246a76942502f61bfe88f60bbc87dafefe80", "0x77bf14037d3f72c65cbaea92fa3f09f2f8978cbe", "0x875819746112630cee95aa78e4327cd4837da70d", "0xce39d66872015a8d1b2070725e6bfc687a418bd0", "0x8c51ddb04f4a6caa42992f43618c4d08bf44b6bf", "0x7d709a567ba2fdbbb92e94e5fe74b9cbbc590835", "0xcd531dafd592be3ca9bef79cdb4c0df8a5104b81", "0x9cb484fad38d953bc79e2a39bbc93655256f0b16", "0x370428430503b3b5970ccaf530cbc71d02c3b61a", "0x586c118d62664c5d253272357359a14349219eba", "0xb96f401f789271bc14ade2229e6189084805c50c", "0x9c2a7bb01951be15fe835886188fa13255ef9486", "0xcb30c203dfeea1ec0060085e1fa31f5a2024a9a3", "0x2ab09e10f75965ccc369c8b86071f351141dc0a1", "0x9255f31ef9b35d085ced6fe29f9e077eb1f513c6", "0x9d74f2ef561f4ac212424b9c2b8cf1ef026a4ac1", "0x3f74c162e4b2baeba31ac1698feb7c5db3affe4a", "0x5e1cb0d1196ff3451204fc40415a81a4d24ec7ed", "0x6feae13b486a225fb2247ccfda40bf8f1dd9d4b1", "0x43355eb69313e2c0397b3713d1c7d9ef99ebcb50", "0x512aa29adde642ad6ca71b8f8214113c0bf8bcbe", "0xf537002ad3db8c37179a3275a7f659b96d4f7426", "0x1758bc16df1d7e969016a7e557292f390ab54a97", "0x25c9af8cb908f0f88bc17bcfc3625f9792112485", "0xaf58fa225780e72b5767ed2f0c717ee816d381a9", "0xd52d34b80285de6f01564afbdb9f1bef26f92f85", "0x3e4acf041179902efb5e13e40a2b0a07d4062392", "0xa3df21cbc328a82375fe2096124eddc053b79fd5", "0xba73a2dfcb2c26c496c783fa7223dd9f6fb4596b", "0x9f1e4c4baa1a573f29253ab1729723d4fa4ae030", "0xc95fdd3d9fba7e07c6b2a798bd04b97d2bc51fda", "0x081b99d53da5ad5a4274111134e5c3d395189f60", "0x2dfb94b9b643d57f4abab47324a4fc987c5942b1", "0x4a68be7e4e00f5d74845c9f222e0c43ad64a87b7", "0x3188f0e2352ee36d0881f4f633c79d977839c5bb", "0x84b774877784ef86b7e7d8f51085da0adda38ce6", "0x802e4949628ea38b7d61126be29a3b3eaee2a27e", "0x12dab9825b85b07f8ddde746066b7ed6bc4c06f8", "0x637a7dc04d692e64c53d5566c51b5db82b7c143d", "0xb13b0277bfd9e8503b6162876cb66d308b12be65", "0x4adb3284ba0285d54f67f5b613aef0172cb83c64", "0x3addbce5a1f5e5945ff37bf995a7adb5799e930b", "0x7d32b39e3d0dc0baa7f40be87730a1bdd0fb4489", "0x26cd565045d39dc25e1558033efbde26406507b6", "0xf43e665a29de152f669add48098d031d92bf713b", "0x52071ba83249f964e09a8bf8050dbb80cde51c62", "0x3012d9bf4a106e0d7a44d7d3eefcaace2c0097fa", "0xed08f5cad599e7f523d6b3fd598005b43aa003bb", "0x27864de8ec1363c5a3dd8663382efb4ee0e565a5", "0x8d3b15a59271c00e9faade99b3e4a7574a0f7337", "0xd1b9038e2b54bc941d6edd54f82e7b6ac0a679c5", "0xf6fcdb3507df9558c44b9a2f468480d58166e4d4", "0x9ac7f5961a452e9cd5be5717bd2c3df412d1c1a5", "0x41a68944bbee2af842a9cd37d1e0d90e071f287e", "0x5a6fd5cd3b545adb0a9e32282276f65f413a8cf7", "0x87d2691ae39942dec5072d629b7707dcca486538", "0xca9391b2fe9fa37595053e0125c442793b9c019a", "0xdc25e70303cb47ef27772598e9e7e10aa37c7df9", "0x5d73239b263d3919db42b91759521e1e380ab5fd", "0xc3d6ad12cd81be7c010991d6a589c6b6a7746df9", "0xb239fc14cff883774295b06607f70f1efc7723b4", "0x798b291c430e58a3a9c62cfac2838297ed60bc25", "0x037220bd2b91e4f0664d3a1213f665da3b06c51c", "0xf754b4de62655826b4f601e56afbd7f31050a624", "0xc33c7dc2c8936fb3feb2b6ae79f832f4cf96ca3c", "0x00553550c72eb242dfb8686e8bc66a1caf67c8f1", "0x6db931b39dd6eddc3624b1cb1906c652810d860c", "0xe19c8d701cef1c9552dd60c04e2ae3eecfcc3374", "0x749e9113e78ffa9f42418d4ed96b1d06ad653868", "0xe26a440a934afe3ff99143ed926becaadb19a2ce", "0x8b4e7162821181d1a0e0264d02351f2975fd7425", "0xe02d8cfa8f7db48f1536245e16a450749178087e", "0x0746a1bced9a59eb234d12bf9f070c3fe799cae2", "0xff233ddc0ebb4f36142b7b8e619c1f12f31b741b", "0x70faf7bbe6aa4efb1762a6cef321ee7db90582fa", "0x53f156bb1b7f182182dda0f0d5eb4f16a84e79d4"]';

export default adapter;
