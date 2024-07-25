import { Chain } from "@defillama/sdk/build/general";
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

type IFactory = {
  address: string;
  block: number;
};

type ISilo = {
  lens: string;
  factory: IFactory | IFactory[];
};

type IAddress = {
  [s: string | Chain]: ISilo[];
};

// const silo: IAddress = {
//   [CHAIN.ETHEREUM]: ["0x0e466FC22386997daC23D1f89A43ecb2CB1e76E9","0x32a4Bcd8DEa5E18a12a50584682f8E4B77fFF2DF"],
//   [CHAIN.ARBITRUM]: ["0xBDb843c7a7e48Dc543424474d7Aa63b61B5D9536"],
//   [CHAIN.OPTIMISM]: ["0xd3De080436b9d38DC315944c16d89C050C414Fed"],
//   [CHAIN.BASE]: ["0x196D312fd81412B6443620Ca81B41103b4E123FD"],
// };

const silo: IAddress = {
  [CHAIN.ETHEREUM]: [
    {
      lens: "0x0e466FC22386997daC23D1f89A43ecb2CB1e76E9",
      factory: [
        {
          address: "0x4D919CEcfD4793c0D47866C8d0a02a0950737589",
          block: 15307294,
        },
        {
          address: "0x6d4A256695586F61b77B09bc3D28333A91114d5a",
          block: 17391885,
        },
      ],
    },
    {
      lens: "0x32a4Bcd8DEa5E18a12a50584682f8E4B77fFF2DF",
      factory: {
        address: "0x2c0fA05281730EFd3ef71172d8992500B36b56eA",
        block: 17782576,
      },
    },
  ],
  // [CHAIN.ARBITRUM]: [
  //   {
  //     lens: "0xBDb843c7a7e48Dc543424474d7Aa63b61B5D9536",
  //     factory: {
  //       address: "0x4166487056A922D784b073d4d928a516B074b719",
  //       block: 51894508,
  //     },
  //   },
  // ],
  // [CHAIN.OPTIMISM]: [
  //   {
  //     lens: "0xd3De080436b9d38DC315944c16d89C050C414Fed",
  //     factory: {
  //       address: "0x6B14c4450a29Dd9562c20259eBFF67a577b540b9",
  //       block: 120480601,
  //     },
  //   },
  // ],
  // [CHAIN.BASE]: [
  //   {
  //     lens: "0x196D312fd81412B6443620Ca81B41103b4E123FD",
  //     factory: {
  //       address: "0x408822E4E8682413666809b0655161093cd36f2b",
  //       block: 16262586,
  //     },
  //   },
  // ],
};

const fallbackBlacklist: string[] = [
  "0x6543ee07cf5dd7ad17aeecf22ba75860ef3bbaaa",
];

async function getSilos(silos: ISilo[], { getLogs }: FetchOptions) {
  const logs: any = [];
  for (const { factory } of silos) {
    if (Array.isArray(factory)) {
      for (const { address, block } of factory) {
        const logChunk = await getLogs({
          target: address,
          fromBlock: block,
          topic: "NewSiloCreated(address,address,uint128)",
        });
        logs.push([...logs, ...logChunk]);
      }
    } else {
      const { address, block } = factory;
      console.log(`Address: ${address}, Block: ${block}`);
    }
  }

  console.log(logs);

  // for (let factory of config[chain].factories) {
  //   const { SILO_FACTORY, START_BLOCK } = factory;
  //   let logChunk = await getLogs({
  //     api,
  //     target: SILO_FACTORY,
  //     fromBlock: START_BLOCK,
  //     topic: "NewSiloCreated(address,address,uint128)",
  //   });
  //   logs = [...logs, ...logChunk];
  // }

  // return logs
  //   .map((log) => `0x${log.topics[1].substring(26)}`)
  //   .filter(
  //     (address) => fallbackBlacklist.indexOf(address.toLowerCase()) === -1
  //   );
}

const fetch = async (
  options: FetchOptions,
  silos: ISilo[]
): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const test = await getSilos(silos, options);

  // console.log(silo);

  return { dailyFees };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: (options: FetchOptions) => fetch(options, silo[CHAIN.ETHEREUM]),
      start: 1668812400,
    },
  },
  version: 2,
};

export default adapter;

// const config = {
//   ethereum: {
//     factories: [
//       {
//         START_BLOCK: 15307294,
//         SILO_FACTORY: '0x4D919CEcfD4793c0D47866C8d0a02a0950737589', // Silo Ethereum (Original)
//       },
//       {
//         START_BLOCK: 17391885,
//         SILO_FACTORY: '0x6d4A256695586F61b77B09bc3D28333A91114d5a' // Silo Ethereum (Convex Factory)
//       },
//       {
//         START_BLOCK: 17782576,
//         SILO_FACTORY: '0x2c0fA05281730EFd3ef71172d8992500B36b56eA' // Silo Ethereum (LLAMA Edition)
//       }
//     ]
//   },
//   arbitrum: {
//     factories: [
//       {
//         START_BLOCK: 51894508,
//         SILO_FACTORY: '0x4166487056A922D784b073d4d928a516B074b719', // Silo Arbitrum (Original)
//       }
//     ]
//   },
//   optimism: {
//     factories: [
//       {
//         START_BLOCK: 120480601,
//         SILO_FACTORY: '0x6B14c4450a29Dd9562c20259eBFF67a577b540b9', // Silo Optimism (Original)
//       }
//     ]
//   },
// }
