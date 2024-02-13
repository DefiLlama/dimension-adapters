import { ChainBlocks, FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { Chain } from "@defillama/sdk/build/general";

const event_swap = 'event Swap(address indexed sender,address indexed to,uint24 id,bytes32 amountsIn,bytes32 amountsOut,uint24 volatilityAccumulator,bytes32 totalFees,bytes32 protocolFees)';

type TPool = {
  [c: string]: string[];
}
const pools: TPool = {
  [CHAIN.BSC]: [
    '0xdce12347b429a32a177708646d4024449827a69a',
    '0x3708d924f627d8109687ce10f6c324445c28347c',
    '0x7e6857d4b2efaf9ff29f88f6d7d083a160e0849e',
  ],
  [CHAIN.AVAX]: [
    '0xd9fa522f5bc6cfa40211944f2c8da785773ad99d',
    '0x4224f6f4c9280509724db2dbac314621e4465c29',
    '0x1901011a39b11271578a1283d620373abed66faa',
    '0xd446eb1660f766d533beceef890df7a69d26f7d1',
    '0x87eb2f90d7d0034571f343fb7429ae22c1bd9f72',
    '0x9b2cc8e6a2bbb56d6be4682891a91b0e48633c72',
    '0x9f8973fb86b35c307324ec31fd81cf565e2f4a63',
    '0xa99f186580d88fec124f8a1bb3f29cc610b66b6b',
    '0xb2a765cbde23b871ffdea95880c8bea979720d36',
    '0xc0dfc065894b20d79aade34a63b5651061b135cc',
    '0x9a0a97d8005d9f783a054aa5cd8878bb0ccf414d',
    '0x51146e0bf2dcc368de6f5201fe7c427da28d05de',
    '0x2f1da4bafd5f2508ec2e2e425036063a374993b6',
    '0x6fe050dc81b98e4464d3b4461a7995a8bf3350db',
    '0x42c701d4e359178412d014506cfac43a67e57d6d',
    '0xe2b11d3002a2e49f1005e212e860f3b3ec73f985',
    '0x16396b65d5e0794c44447396f94665d3b9f576a0',
    '0x7c13d4c3e9dfa683e7a5792a9ff20cb5fd22b0c0',
    '0x6dbcf39c6686a4088a224a18f63f92fe6535f7a8'
  ],
  [CHAIN.ARBITRUM]: [
    '0x94d53be52706a155d27440c4a2434bea772a6f7c',
    '0xee1d31ab646056f549a78feacb73be45332fa078',
    '0x003ad0975250c810ad75fd83e989f54625cac514',
    '0x4b9bfed1dd4e6780454b2b02213788f31ffba74a',
    '0xdf34e7548af638cc37b8923ef1139ea98644735a',
    '0xd387c40a72703b38a5181573724bcaf2ce6038a5',
    '0x0f475257b6e2fa9a48ef84cb4a91d4288729f39e',
    '0xf8a60082039a1acbe43b045f87aa0c5f24a358a4',
    '0xc5a7c9d6653218dccca5633595b8604200f84855',
    '0x60563686ca7b668e4a2d7d31448e5f10456ecaf8'
  ]
}

const graph = (chain: Chain) => {
  return async (timestamp: number , _: ChainBlocks, { createBalances, getLogs, api }: FetchOptions): Promise<FetchResultFees> => {
    const dailyFees = createBalances();
    const dailyRevenue = createBalances();
    const lpTokens = pools[chain]
    const [tokenXs, tokenYs] = await Promise.all(
      ['address:getTokenX', 'address:getTokenY'].map((method: string) =>
        api.multiCall({
          abi: method,
          calls: lpTokens,
        })
      )
    );
    const decimalsXs = await api.multiCall({  abi: 'erc20:decimals', calls: tokenXs})
    const decimalsYs = await api.multiCall({  abi: 'erc20:decimals', calls: tokenYs})


    const logs: any[][] = await getLogs({
      targets: lpTokens,
      eventAbi: event_swap,
      flatten: false,
    })

    lpTokens.map((_: string, index: number) => {
      logs[index]
        .map((p: any) => {
          const token0 = tokenXs[index];
          const token1 = tokenYs[index];
          const decimalsX = decimalsXs[index];
          const decimalsY = decimalsYs[index];
          const protocolFeesY = Number('0x' + p.protocolFees.replace('0x', '').slice(0, 32))
          const protocolFeesX = Number('0x' + p.protocolFees.replace('0x', '').slice(32, 64))
          const totalFeesY = Number('0x' + p.totalFees.replace('0x', '').slice(0, 32));
          const totalFeesX = Number('0x' + p.totalFees.replace('0x', '').slice(32, 64));
          dailyFees.add(token0, totalFeesX / 10 ** (18 - decimalsX))
          dailyFees.add(token1, totalFeesY / 10 ** (18 - decimalsY))
          dailyRevenue.add(token0, protocolFeesX / 10 ** (18 - decimalsX))
          dailyRevenue.add(token1, protocolFeesY / 10 ** (18 - decimalsY))
        });
    });

    const dailySupplySideRevenue = dailyFees.clone();
    dailySupplySideRevenue.subtract(dailyRevenue);
    return {
      dailyFees: dailyFees,
      dailyUserFees: dailyFees,
      dailyRevenue: dailyRevenue,
      dailyProtocolRevenue: dailyRevenue,
      dailyHoldersRevenue: dailyRevenue,
      dailySupplySideRevenue,
      timestamp,
    };
  }
}


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: graph(CHAIN.ARBITRUM),
      start: 1682121600,
    },
    [CHAIN.BSC]: {
      fetch: graph(CHAIN.BSC),
      start: 1681084800,
    },
    [CHAIN.AVAX]: {
      fetch: graph(CHAIN.AVAX),
      start: 1682467200,
    },
  }
};

export default adapter;
