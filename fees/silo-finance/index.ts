import { Chain } from "../../adapters/types";
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

type FeeResult = {
  asset: string;
  fee: bigint;
};

type IFactory = {
  address: string;
  block: number;
};

type ISilo = {
  lens: string;
  factory: IFactory | IFactory[];
  silos?: { silo: string; assets: string[] }[];
};

type IAddress = {
  [s: string | Chain]: ISilo[];
};

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
  [CHAIN.ARBITRUM]: [
    {
      lens: "0xBDb843c7a7e48Dc543424474d7Aa63b61B5D9536",
      factory: {
        address: "0x4166487056A922D784b073d4d928a516B074b719",
        block: 51894508,
      },
    },
  ],
  [CHAIN.OPTIMISM]: [
    {
      lens: "0xd3De080436b9d38DC315944c16d89C050C414Fed",
      factory: {
        address: "0x6B14c4450a29Dd9562c20259eBFF67a577b540b9",
        block: 120480601,
      },
    },
  ],
  [CHAIN.BASE]: [
    {
      lens: "0x196D312fd81412B6443620Ca81B41103b4E123FD",
      factory: {
        address: "0x408822E4E8682413666809b0655161093cd36f2b",
        block: 16262586,
      },
    },
  ],
  [CHAIN.SONIC]: [
    {
      lens: "0x9e286a90Dcb47cA24d6dC50842839a1a61B8Dc38",
      factory: {
        address: "0xa42001D6d2237d2c74108FE360403C4b796B7170",
        block:
          2672166,
      },
    },
  ]
};

async function getSilos(
  silos: ISilo[],
  { getLogs, chain }: FetchOptions
): Promise<ISilo[]> {
  const logs: any = [];

  const fetchLogsFromFactory = async (address: string, block: number) => {
    const sonicSilos: { silo: string; assets: string[] }[] = [];
    if (chain === "sonic") {
      const logChunk = await getLogs({
        target: address,
        fromBlock: block,
        eventAbi: "event NewSilo(address indexed implementation, address indexed token0, address indexed token1, address silo0, address silo1, address siloConfig)",
      });

      //we just need to get silo0 and silo1 addresses without having to check the assets in the silo, store token0 and token1 for future use
      for (const result of logChunk) {
        const token0 = result[1];
        const token1 = result[2];
        const silo0 = result[3];
        const silo1 = result[4];
        sonicSilos.push({
          silo: silo0,
          assets: [token0]
        });
        sonicSilos.push({
          silo: silo1,
          assets: [token1]
        });
      }

      logs.push(sonicSilos);
    } else {
      const logChunk = await getLogs({
        target: address,
        fromBlock: block,
        eventAbi: "event NewSiloCreated(address indexed silo, address indexed asset, uint128 version)",
      });

      logs.push(logChunk.map((result) => ({
        silo: result[0],
        assets: [] 
      })));
    }
  };

  for (const { factory } of silos) {
    if (Array.isArray(factory)) {
      for (const { address, block } of factory) {
        await fetchLogsFromFactory(address, block);
      }
    } else {
      const { address, block } = factory;
      await fetchLogsFromFactory(address, block);
    }
  }

  return silos.map((silo, index) => ({
    ...silo,
    silos: logs[index] || []
  }));
}

async function getSilosAssets(
  silos: ISilo[],
  { api }: FetchOptions
): Promise<ISilo[]> {
  const siloAddresses = silos.flatMap((silo) =>
    (silo.silos || []).map((s) => ({ target: s.silo }))
  );

  const assetsInSilosRes = await api.multiCall({
    calls: siloAddresses,
    abi: "function getAssets() view returns (address[] assets)",
  });

  const assetsMap: { [key: string]: string[] } = {};
  siloAddresses.forEach((call, index) => {
    assetsMap[call.target] = assetsInSilosRes[index];
  });

  return silos.map((silo) => ({
    ...silo,
    silos: (silo.silos || []).map((s) => ({
      silo: s.silo,
      assets: assetsMap[s.silo] || [],
    })),
  }));
}

async function getSilosFeesStorage(
  rawSilos: ISilo[],
  { fromApi, toApi, chain }: FetchOptions
): Promise<{ totalFeesResults: FeeResult[]; dailyFeesResults: FeeResult[] }> {
  const totalFeesResults: FeeResult[] = [];
  const dailyFeesResults: FeeResult[] = [];

  if (chain === "sonic") {
    const calls = rawSilos.flatMap((silo) =>
      (silo.silos || []).map(({ silo: siloAddress, assets }) => ({
        target: silo.lens,
        params: [siloAddress],
        siloAddress,
        asset: assets[0]
      }))
    );

    const [prevFeesInSilosRes, currFeesInSilosRes] = await Promise.all([
      fromApi.multiCall({
        calls: calls,
        abi: "function protocolFees(address _silo) view returns (uint256)",
        permitFailure: true,
      }),
      toApi.multiCall({
        calls: calls,
        abi: "function protocolFees(address _silo) view returns (uint256)",
        permitFailure: true,
      }),
    ]);
    calls.forEach((call, index) => {
      const prevFee = prevFeesInSilosRes[index];
      const currFee = currFeesInSilosRes[index];
      const asset = call.asset;

      if (!prevFee || !currFee) return;

      totalFeesResults.push({ asset, fee: currFee });
      dailyFeesResults.push({ asset, fee: BigInt(currFee - prevFee) });
    });
    
  } else {

    const calls = rawSilos.flatMap((silo) =>
      (silo.silos || []).flatMap(({ silo: siloAddress, assets }) =>
        assets.map((asset) => ({
          target: silo.lens,
          params: [siloAddress, asset],
        }))
      )
    );

    const [prevFeesInSilosRes, currFeesInSilosRes] = await Promise.all([
      fromApi.multiCall({
        calls: calls,
        abi: "function protocolFees(address _silo, address _asset) view returns (uint256)",
        permitFailure: true,
      }),
      toApi.multiCall({
        calls: calls,
        abi: "function protocolFees(address _silo, address _asset) view returns (uint256)",
        permitFailure: true,
      }),
    ]);

    calls.forEach((call, index) => {
      const [_siloAddress, asset] = call.params;
      const prevFee = prevFeesInSilosRes[index];
      const currFee = currFeesInSilosRes[index];

      if (!prevFee || !currFee) return;
      totalFeesResults.push({ asset, fee: currFee });
      dailyFeesResults.push({ asset, fee: BigInt(currFee - prevFee) });
    });
  }

  return { totalFeesResults, dailyFeesResults };
}

async function fetch(
  options: FetchOptions,
  rawSilos: ISilo[]
): Promise<FetchResultV2> {
  const totalFees = options.createBalances();
  const dailyFees = options.createBalances();

  const rawSiloWithAddresses = await getSilos(rawSilos, options);
  const siloWithAssets = options.chain === "sonic"
    ? rawSiloWithAddresses
    : await getSilosAssets(rawSiloWithAddresses, options);
  const { totalFeesResults, dailyFeesResults } = await getSilosFeesStorage(
    siloWithAssets,
    options
  );

  totalFeesResults.forEach(({ asset, fee }) => {
    totalFees.add(asset, fee);
  });

  dailyFeesResults.forEach(({ asset, fee }) => {
    dailyFees.add(asset, fee);
  });

  return { totalFees, dailyFees };
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: (options: FetchOptions) => fetch(options, silo[CHAIN.ETHEREUM]),
      start: '2022-08-10',
    },
    [CHAIN.ARBITRUM]: {
      fetch: (options: FetchOptions) => fetch(options, silo[CHAIN.ARBITRUM]),
      start: '2023-05-02',
    },
    [CHAIN.OPTIMISM]: {
      fetch: (options: FetchOptions) => fetch(options, silo[CHAIN.OPTIMISM]),
      start: '2024-05-25',
    },
    [CHAIN.BASE]: {
      fetch: (options: FetchOptions) => fetch(options, silo[CHAIN.BASE]),
      start: '2024-06-26',
    },
    [CHAIN.SONIC]: {
      fetch: (options: FetchOptions) => fetch(options, silo[CHAIN.SONIC]),
      start: '2025-01-06',
    },
  },
  version: 2,
};

export default adapter;
