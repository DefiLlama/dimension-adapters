import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDefaultDexTokensBlacklisted } from "../../helpers/lists";
import { formatAddress } from "../../utils/utils";

// https://api.dodoex.io/dodo-contract/list
const config: any = {
  [CHAIN.ETHEREUM]: {
    DODOFeeRouteProxys: [
      "0x21b9F852534Fb9DdC3A0A7B24f067B50d8AC9a99",
      "0x50f9bDe1c76bba997a5d6e7FEFff695ec8536194",
      "0xFe837A3530dD566401d35beFCd55582AF7c4dfFC",
      "0x5977F12664b4E634dFbAAD0ad4a6a81057254dA8",
    ],
  },
  [CHAIN.OPTIMISM]: {
    DODOFeeRouteProxys: [
      "0x716fcc67dcA500A91B4a28c9255262c398D8f971",
      "0xc7d7CC1e9f5E823887980c9C51F9c418ee3A3e28",
      "0x3a64Ec3606FF7310E8fAd6FcC008e39705fB496d",
      "0x8b09DB11ea380d6454D2592D334FFC319ce6EF3E",
    ],
  },
  [CHAIN.BSC]: {
    DODOFeeRouteProxys: [
      "0xa8b034301Bb5DD3610db585Def3e7C0d52f2319F",
      "0x0656fD85364d03b103CEEda192FB2D3906A6ac15",
      "0xb95ed7e958e196688984951f41ac2888f4b10ab9",
      "0x0343C5757Fb98aD9eF39824e08B852aF61C71c64",
      "0x701Ac6fAD7850956f966a85655348ac1B7c93368",
    ],
  },
  [CHAIN.POLYGON]: {
    DODOFeeRouteProxys: [
      "0x39E3e49C99834C9573c9FC7Ff5A4B226cD7B0E63",
      "0xA103206E7f19d1C1c0e31eFC4DFc7b299630F100",
      "0x46AFE01D758a46d64c7d8E0791314D5db3E2e683",
      "0x3a64Ec3606FF7310E8fAd6FcC008e39705fB496d",
    ],
  },
  [CHAIN.BOBA]: {
    DODOFeeRouteProxys: [
      "0x64842A3EbC09bB69429c1a34ae181375fea5f17F",
      "0xfcA520C94078b65F8237d4F566c438a9468917A1",
    ],
  },
  [CHAIN.CONFLUX]: {
    DODOFeeRouteProxys: [
      "0x3037e79FCe8817A6F21196d8D93C80F53ABB9267",
      "0x5a71a8524477Acd1807CFefD114Bf8904CD8dF96",
    ],
  },
  [CHAIN.MOONRIVER]: {
    DODOFeeRouteProxys: [
      "0x003B18357460e789e711849749A793c430d14f97",
      "0x2144BF2003bFd9Aa0950716333fBb5B7A1Caeda4",
    ],
  },
  [CHAIN.MANTLE]: {
    DODOFeeRouteProxys: [
      "0xB4E598688eC724DD00a8944E7c7b259BbB992c61",
      "0x70B9C57E1fF24761C1C3ced57Ddae9A3F3570698",
    ],
  },
  [CHAIN.BASE]: {
    DODOFeeRouteProxys: [
      "0x987bFBE33c9cF18cAA665B792Db66339a9c16D32",
      "0xA376762070F7fCE8f3646AAe90e6e375e6daF128",
      "0x8b09DB11ea380d6454D2592D334FFC319ce6EF3E",
      "0x3A7Bc5F9E41356728f037f17D88c642EE46d1Aaa",
    ],
  },
  [CHAIN.AVAX]: {
    DODOFeeRouteProxys: [
      "0xbce44767af0a53A108b3B7ba4F740E03D228Ec0A",
      "0x1F076a800005c758a505E759720eb6737136e893",
      "0x3a64Ec3606FF7310E8fAd6FcC008e39705fB496d",
      "0x8b09DB11ea380d6454D2592D334FFC319ce6EF3E",
    ],
  },
  [CHAIN.ARBITRUM]: {
    DODOFeeRouteProxys: [
      "0xe05dd51e4eB5636f4f0E8e7Fbe82eA31a2ecef16",
      "0xc4A1a152812dE96b2B1861E433f42290CDD7f113",
      "0x69716E51E3F8Bec9c3D4E1bB46396384AE11C594",
      "0x056FcE6B76AF3050F54B71Fc9B5fcb7C387BfC1A",
    ],
  },
  [CHAIN.LINEA]: {
    DODOFeeRouteProxys: [
      "0x70B9C57E1fF24761C1C3ced57Ddae9A3F3570698",
      "0x03e89fC55A5ad0531576E5a502c4CA52c8bf391B",
    ],
  },
  [CHAIN.SCROLL]: {
    DODOFeeRouteProxys: [
      "0xf0512872fEc0173d1d99c2dd8CDCb770054b675b",
      "0x4e998615aD430C1cA46A69d813edE6EB3EC55eDb",
    ],
  },
  [CHAIN.MANTA]: {
    DODOFeeRouteProxys: [
      "0x2933c0374089D7D98BA0C71c5E02E1A0e09deBEE",
      "0x200D866Edf41070DE251Ef92715a6Ea825A5Eb80",
    ],
  },
  [CHAIN.ZERO]: {
    DODOFeeRouteProxys: [
      "0x2aea827424f99a187A2bF056F0782E927AB2066a",
      "0x0e038eaEf8383dfcE2B80b6E4E3F25Fd963527C4",
    ],
  },
  [CHAIN.ZIRCUIT]: {
    DODOFeeRouteProxys: [
      "0x518Bfe0c91C1C8e9588b9218B87C38Fa6b9735D6",
      "0x3b0c6c0CE667844e742Ce0Ca533EaA2b6f422AA8",
    ],
  },
};

const abis = {
  OrderHistory:
    "event OrderHistory (address fromToken, address toToken, address sender, uint256 fromAmount, uint256 returnAmount)",
};

const fetch = async (
  timestamp: number,
  _: ChainBlocks,
  { createBalances, getLogs, chain }: FetchOptions
) => {
  const dailyVolume = createBalances();
  const blacklistTokens = getDefaultDexTokensBlacklisted(chain)
  const logs = (await getLogs({
    targets: config[chain].DODOFeeRouteProxys,
    eventAbi: abis.OrderHistory,
  }))
    .filter(log => !blacklistTokens.includes(formatAddress(log.fromToken)) && !blacklistTokens.includes(formatAddress(log.toToken)))
  logs.forEach((log: any) => {
    dailyVolume.add(log.fromToken, log.fromAmount);
  });
  return { timestamp, dailyVolume };
};

const adapter_agg = {
  adapter: {},
};

Object.keys(config).forEach(
  (chain) => ((adapter_agg.adapter as any)[chain] = { fetch, start: "2024-08-01" })
);

const adapter: SimpleAdapter = {
  adapter: adapter_agg.adapter,
};

export default adapter;
