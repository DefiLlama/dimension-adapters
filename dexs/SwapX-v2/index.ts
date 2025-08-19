import { CHAIN } from "../../helpers/chains";
import request, { gql } from "graphql-request";
import {
  FetchOptions,
  SimpleAdapter,
  FetchResultVolume,
  FetchResultFees,
} from "../../adapters/types";
import BigNumber from "bignumber.js";
import { SWAPX_GRAPHQL_ENDPOINT } from "../SwapX-algebra";

type Feed = "volumeUSD" | "feesUSD";

export const fetchSwapXV2Data = async (
  timestamp: number,
  _: any,
  options: FetchOptions,
  feedKey: Feed
): Promise<FetchResultVolume | FetchResultFees> => {
  const query = gql`
    {
        v2PoolDayDatas(where:{pool_in: ${whitelistedPairs}, date: ${options.startOfDay}}) {
            pool {
                id
            }
            ${feedKey}
        }
        v2Pools(where:{id_in: ${whitelistedPairs}}) {
            ${feedKey}
        }
    }`;
  const req = await request(SWAPX_GRAPHQL_ENDPOINT, query);

  let dailyUSD = "0";
  req.v2PoolDayDatas.map((d) => {
    dailyUSD = new BigNumber(dailyUSD).plus(d[feedKey]).toString();
  });

  let totalUSD = "0";
  req.v2Pools.map((d) => {
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
      fetch: (t, _, o) => fetchSwapXV2Data(t, _, o, "volumeUSD"),
      start: "2024-12-23",
    },
  },
};

export default adapter;

const whitelistedPairs =
  '["0x784dd93f3c42dcbf88d45e6ad6d3cc20da169a60", "0xf9b7a6da525f6f05910f99b298bb792025128c6f", "0xbb8ae5b889243561ac9261f22f592b72250afd1f", "0xd1cb1622a50506f0fddf329cb857a0935c7fbbf9", "0xe6aa7ca47ddb6203e71d4d1497959da51f87aa98", "0xbf23e7fc58b7094d17fe52ef8bde979aa06b8916", "0x24f5cd888057a721f1acd7cba1afa7a8384c3e12", "0x4d864c2cfb4c11a2cee4c2d5cbfa318c7b7e14f8", "0x36e0c9ee4da91101b6509586b820190015e9114f", "0xc3a185226d594b56d3e5cf52308d07fe972ca769", "0x09b3227d58e3fd1add7d411f5a907b7955a67586", "0xf5d31549b9a1e5b8228f49542684ee97b707840e", "0xebeec250676833b96505d8e2967215e91c74e477", "0x03281b6f11d943157a973cdb6b39b747501bdbba", "0xb545ea688f4d14d37b91df6370d75c922f4e9232", "0x8218825e5964e17d872adcefa4c72d73c0d44021", "0xb45eec52659538d494a9c5ffac23642bccdd9383", "0x1d64b681315839c83bf545b7a041f4e5111bee39", "0x6e35ff987d8fe43ee6e06fa55c8df26b81c03bb3", "0xad88149c1030d7544f244958f4889b5eda49a381", "0xcfe67b6c7b65c8d038e666b3241a161888b7f2b0", "0xb624f982eec46b97893f0fe19fb27a4c6fb7bc48", "0xaac0cbe1ba8e5d82afe0fbee40b154ceb2b3cdbb", "0x7432d8e46d1e72f7af15247b36909e3eb6319931", "0x2af26b4ca83d234527797e62d2bf3e4f7d5cf941", "0x1695d6bd8d8adc8b87c6204be34d34d19a3fe1d6", "0xe87080413295b7a3b9c63f82a3337a882750f974", "0x51caf8b6d184e46aeb606472258242aacee3e23b", "0xe36fd664c99ed50e6c6321bccaf22fbcea1ab43d", "0x4dd065383db745df16e33c75136da73467e71603", "0x35c8fbe74fda8eac510ad5fa4806e0e8e18ae5e9", "0x5174ba02e87f4d81b32e8845f1d55c99b4d79fd7", "0x12c4a07377adf44eca161895ab2d60d118e3ef70", "0x538110e3d0b81e4a0da90b8724869242b2e16861", "0x7c82a2adc8f18e2418eb3ff77b57ede5bf718021", "0x5d6d57c7b115e37fd49fc04b28b58d0eaee1cb24", "0x9932fa8780a92aea4477d4b70612d85a8f81b1b4", "0xe47f6e1951cf3abf8f5f4e366054597cc3b8cdf3", "0xa90eaa2aa6df4053ee981c9df6944f49da7d9912", "0x669b2860a7ef937e6fb11c42bd8105cbef3b122f", "0x062a69a06389102a4a71d418f6f453fbc524ea50", "0xa05e7fa5bc71fc469dbecce3b7cf3988866a8787", "0x0c3364b0311e322072950b03b353beab87b13117", "0x1209f281d51da3983b34c9af95a766282989e327", "0x823c77a16003885c3861bd067659996e75611fde", "0x16030ba2d092a922783607153209f290c09dd1a9", "0x353f9bfd8e01ff383be55ac1607fb24df2f50de0", "0xa5ef7a02fbd51bdd74a20bba8fafc58cb188b91f", "0x23dc62aec2c176a7615e1c1362f5db930763e242", "0xc603fca4a09b637c0a3de235515a09c9f00ddcd3", "0x7147b69a7271c2a41e6cb8b46bdb4d17eef22fd6", "0xa57fef2c89255f3e8ec471f2e26f1394826e667b", "0x775e672e00a7845449e238d7de6df1ad578c2d0e", "0x6eb04da55e61e2acdac3cc22470960c54f122735", "0x2fef27790307f88b1f1b3a7e4f28fa2de98e8ee0", "0x811cb8c9d6f1e26162c0c5268f31287f41b2ccfb", "0x1c94efbd1f20fe336d18a71719e39899072b2296", "0xcdeda3e84e509c37e5980f4ed313feeb6473754b", "0xf7cf65abee5981e6ee1829ce7637c42d810c12d5", "0x478bed4a24a7056df168300fd4cdbb441b76a5fb", "0x95b52655ca6c13ed715166d40ee7f71946710892", "0x9f35564c94b1939f55cccd866648ce83897c8e4e", "0xff7f69b5cb0af754c3f455e81363132c736b0153", "0x6443fce682d0fc06f3ea84fcce4de4d6b8a66239", "0x7be768d91cd3013839d7ef258bfe9103d4b5e133", "0xc12997e00c40df342267ca716816a4f20b5ab12b", "0x5074df6808e4780b8fcf7f4743724f8445b86f15", "0x9a8b61f0f40519ea9e3ef2c3c7e3c1a233ffc66f", "0xa5507e79a22c8c8df19fdc5f0e8350350c6da946", "0xdc4b16cfb122311f6e0c0b54005f79fb886b43ce", "0x07de4ec5fcbc5f0b60f700155c13417d69b548fe", "0xf71b4b9e7e53459b7e7d2c9894db10bea615288a", "0x6004337a618e4e2ffe27044e28c43b3aad5c1048", "0xb2f6042bba92ef87181405c999c3a85ec504d795", "0x7128cb30a65b8b557d5e7e080151af755d5570e7", "0x94a6800afdc81fb13bd7fc18e69d4ea8b96304dd", "0x109b1d04e46648d4208148f222a543805f8e1a58", "0xb4663c6c02895d8843036a9a69cf21b2efe064fd", "0x0666b11a59f02781854e778687ce312d6b306ce4"]';
