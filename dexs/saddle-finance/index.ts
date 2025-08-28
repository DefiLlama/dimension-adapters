import { BaseAdapterChainConfig, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSaddleVolume } from "../../helpers/saddle";

// const endpoints = {
//   [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('79UL5SaLLsbXqC8Ks6v3fwWHR1FRs636FFRHn55o5SWq'),
//   [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('AB2t32R1htdcguMQVVGt4biKGFeQ2HfXkEgJNkKi1dJa')
// };

// const graphs = getChainVolume2({
//   graphUrls: endpoints,
//   totalVolume: {
//     factory: "tradeVolumes",
//     field: "volume",
//   },
// });

const PoolRegistries: {[key: string]: string} = {
  [CHAIN.ETHEREUM]: '0xc5ad17b98D7fe73B6dD3b0df5b3040457E68C045',
  [CHAIN.ARBITRUM]: '0xaB94A2c0D8F044AA439A5654f06b5797928396cF',
}

const POOL_REGISTRY_BYTES = "0x506f6f6c52656769737472790000000000000000000000000000000000000000";

async function fetch(options: FetchOptions) {
  const poolRegAddress = await options.api.call({
    abi: "function resolveNameToLatestAddress(bytes32 name) view returns (address)",
    target: PoolRegistries[options.chain],
    params: [POOL_REGISTRY_BYTES],
  })
  const poolsDatas = await options.api.fetchList({
    lengthAbi: "uint256:getPoolsLength",
    itemAbi: `function getPoolDataAtIndex(uint256 index) view returns (tuple(
      address poolAddress,
      address lpToken,
      uint8 typeOfAsset,
      bytes32 poolName,
      address targetAddress,
      address[] tokens,
      address[] underlyingTokens,
      address basePoolAddress,
      address metaSwapDepositAddress,
      bool isSaddleApproved,
      bool isRemoved,
      bool isGuarded
      ))`,
    target: poolRegAddress,
  })

  const { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue } = await getSaddleVolume(options, poolsDatas.map((item: any) => item.poolAddress))

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'User pay fees per swap.',
    UserFees: 'User pay fees per swap.',
    Revenue: 'Amount of swap fees shared to admin.',
    ProtocolRevenue: 'Protocol gets 100% revenue share from swap fees.',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  fetch,
  chains: [CHAIN.ETHEREUM, CHAIN.ARBITRUM],
  adapter: {
    [CHAIN.ETHEREUM]: {
      start: '2022-03-20',
    },
    [CHAIN.ARBITRUM]: {
      start: '2022-06-19',
    },
  },
};

export default adapter;
