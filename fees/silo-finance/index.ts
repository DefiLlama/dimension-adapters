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
};

async function getSilos(
  silos: ISilo[],
  { getLogs }: FetchOptions
): Promise<ISilo[]> {
  const logs: any = [];

  const fetchLogsFromFactory = async (address: string, block: number) => {
    const logChunk = await getLogs({
      target: address,
      fromBlock: block,
      eventAbi:
        "event NewSiloCreated(address indexed silo, address indexed asset, uint128 version)",
    });

    logs.push(logChunk.map((result) => result[0]));
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
    silos: logs[index]?.map((siloAddress: string) => ({
      silo: siloAddress,
      assets: [],
    })),
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
  { api }: FetchOptions
): Promise<{ asset: string; fee: bigint }[]> {
  const calls = rawSilos.flatMap((silo) =>
    (silo.silos || []).flatMap(({ silo: siloAddress, assets }) =>
      assets.map((asset) => ({
        target: silo.lens,
        params: [siloAddress, asset],
      }))
    )
  );

  const assetsInSilosRes = await api.multiCall({
    calls: calls,
    abi: "function protocolFees(address _silo, address _asset) view returns (uint256)",
  });

  const feesMap: { [key: string]: { [key: string]: bigint } } = {};
  calls.forEach((call, index) => {
    const [siloAddress, asset] = call.params;
    if (!feesMap[siloAddress]) {
      feesMap[siloAddress] = {};
    }
    feesMap[siloAddress][asset] = assetsInSilosRes[index];
  });

  const results: { asset: string; fee: bigint }[] = [];
  rawSilos.forEach((silo) => {
    (silo.silos || []).forEach((s) => {
      s.assets.forEach((asset) => {
        const fee = feesMap[s.silo]?.[asset] || 0n;
        results.push({ asset, fee });
      });
    });
  });

  return results;
}

async function fetch(
  options: FetchOptions,
  rawSilos: ISilo[]
): Promise<FetchResultV2> {
  const totalFees = options.createBalances();
  const rawSiloWithAddresses = await getSilos(rawSilos, options);
  const siloWithAssets = await getSilosAssets(rawSiloWithAddresses, options);
  const feesInSilos = await getSilosFeesStorage(siloWithAssets, options);

  feesInSilos.forEach(({ asset, fee }) => {
    totalFees.add(asset, fee);
  });

  return { totalFees };
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: (options: FetchOptions) => fetch(options, silo[CHAIN.ETHEREUM]),
      start: 1660150409,
    },
    [CHAIN.ARBITRUM]: {
      fetch: (options: FetchOptions) => fetch(options, silo[CHAIN.ARBITRUM]),
      start: 1683046409,
    },
    [CHAIN.OPTIMISM]: {
      fetch: (options: FetchOptions) => fetch(options, silo[CHAIN.OPTIMISM]),
      start: 1716656009,
    },
    [CHAIN.BASE]: {
      fetch: (options: FetchOptions) => fetch(options, silo[CHAIN.BASE]),
      start: 1719420809,
    },
  },
  version: 2,
};

export default adapter;
