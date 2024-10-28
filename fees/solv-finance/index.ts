import { Chain } from "@defillama/sdk/build/general";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { addGasTokensReceived, addTokensReceived, getSolanaReceived } from "../../helpers/token";
import { request } from "graphql-request";
import { Balances } from "@defillama/sdk";
import { getConfig } from "../../helpers/cache";
const feesConfig =
  "https://raw.githubusercontent.com/solv-finance-dev/slov-protocol-defillama/main/solv-fees.json";
const graphUrl =
  "https://raw.githubusercontent.com/solv-finance-dev/slov-protocol-defillama/refs/heads/main/solv-graph.json";
const yields = 0.2;

const chains: {
  [chain: Chain]: { deployedAt: number };
} = {
  [CHAIN.ETHEREUM]: {
    deployedAt: 1726531200,
  },
  [CHAIN.BSC]: {
    deployedAt: 1726531200,
  },
  [CHAIN.ARBITRUM]: {
    deployedAt: 1726531200,
  },
  [CHAIN.MANTLE]: {
    deployedAt: 1726531200,
  },
  [CHAIN.MERLIN]: {
    deployedAt: 1726531200,
  },
  [CHAIN.CORE]: {
    deployedAt: 1726531200,
  },
  [CHAIN.SCROLL]: {
    deployedAt: 1726531200,
  },
};

const fetch: FetchV2 = async (options) => {
  const contracts: {
    [chain: Chain]: {
      [protocolFees: string]: {
        address: string[];
        token: string[];
        deployedAt: number;
      };
    };
  } = await getConfig('solv-fi/fees', feesConfig);

  if (!contracts[options.chain])
    return {}


  const dailyFees = options.createBalances();
  const feeRevenue = await feeRevenues(options, contracts);
  dailyFees.addBalances(feeRevenue);

  const dailyRevenue = options.createBalances();
  const receivedRevenues = await revenues(options, contracts);
  dailyRevenue.addBalances(receivedRevenues);

  dailyRevenue.addBalances(dailyFees.clone(yields));

  return {
    dailyFees,
    dailyRevenue,
  };
};

async function revenues(options: FetchOptions, contracts: any): Promise<Balances> {
  const dailyRevenues = options.createBalances();

  const receivedRevenue = await receivedRevenues(options, contracts);
  dailyRevenues.addBalances(receivedRevenue);

  const nativeTokenRevenue = await nativeTokenRevenues(options, contracts);
  dailyRevenues.addBalances(nativeTokenRevenue);

  const solanaRevenue = await solanaRevenues(options, contracts);
  dailyRevenues.addBalances(solanaRevenue);

  return dailyRevenues;
}

async function receivedRevenues(options: FetchOptions, contracts: any): Promise<Balances> {
  const receivedRevenueConfig = contracts[options.chain]?.receivedRevenue;
  if (!receivedRevenueConfig) {
    return options.createBalances();
  }

  return addTokensReceived({
    options,
    targets: receivedRevenueConfig.address,
    tokens: receivedRevenueConfig.token,
  });
}

async function nativeTokenRevenues(options: FetchOptions, contracts: any): Promise<Balances> {
  const nativeTokenConfig = contracts[options.chain]?.nativeTokenRevenue;
  if (!nativeTokenConfig) {
    return options.createBalances();
  }

  return addGasTokensReceived({
    multisig: nativeTokenConfig.address,
    options,
  });
}

async function solanaRevenues(options: FetchOptions, contracts: any): Promise<Balances> {
  const solanaRevenueConfig = contracts[options.chain]?.solanaRevenue;
  if (!solanaRevenueConfig) {
    return options.createBalances();
  }

  return await getSolanaReceived({ options, targets: solanaRevenueConfig });
}


async function feeRevenues(options: FetchOptions, contracts: any): Promise<Balances> {
  const dailyFees = options.createBalances();

  const protocolFees = await protocol(options, contracts);
  dailyFees.addBalances(protocolFees);

  const poolFees = await pool(options, contracts);
  dailyFees.addBalances(poolFees);

  const nativeTokenFees = await nativeToken(options, contracts);
  dailyFees.addBalances(nativeTokenFees);

  const solanaFees = await solanas(options, contracts);
  dailyFees.addBalances(solanaFees);

  return dailyFees;
}

async function protocol(
  options: FetchOptions,
  contracts: any
): Promise<Balances> {
  if (!contracts[options.chain]["protocolFees"]) {
    return options.createBalances();
  }
  return addTokensReceived({
    options,
    targets: contracts[options.chain]["protocolFees"].address,
    tokens: contracts[options.chain]["protocolFees"].token,
  });
}

async function pool(options: FetchOptions, contracts: any): Promise<Balances> {
  if (!contracts[options.chain]["poolFees"]) {
    return options.createBalances();
  }

  const pools = await getGraphData(
    contracts[options.chain]["poolFees"],
    options.chain
  );
  const shareConcretes = await concrete(pools, options);

  const fromTimestamp = options.fromTimestamp * 1000;
  const toTimestamp = options.toTimestamp * 1000;

  const yesterdayNavs = await options.fromApi.multiCall({
    abi: "function getSubscribeNav(bytes32 poolId_, uint256 time_) view returns (uint256 nav_, uint256 navTime_)",
    calls: pools.map((pool: { navOracle: string; poolId: string }) => ({
      target: pool.navOracle,
      params: [pool.poolId, fromTimestamp],
    })),
  });

  const todayNavs = await options.toApi.multiCall({
    abi: "function getSubscribeNav(bytes32 poolId_, uint256 time_) view returns (uint256 nav_, uint256 navTime_)",
    calls: pools.map((pool: { navOracle: string; poolId: string }) => ({
      target: pool.navOracle,
      params: [pool.poolId, toTimestamp],
    })),
  });

  const poolBaseInfos = await options.api.multiCall({
    abi: `function slotBaseInfo(uint256 slot_) view returns (tuple(address issuer, address currency, uint64 valueDate, uint64 maturity, uint64 createTime, bool transferable, bool isValid))`,
    calls: pools.map(
      (index: {
        contractAddress: string | number;
        openFundShareSlot: any;
      }) => ({
        target: shareConcretes[index.contractAddress],
        params: [index.openFundShareSlot],
      })
    ),
  });

  const shareTotalValues = await options.api.multiCall({
    abi: "function slotTotalValue(uint256) view returns (uint256)",
    calls: pools.map(
      (index: {
        contractAddress: string | number;
        openFundShareSlot: any;
      }) => ({
        target: shareConcretes[index.contractAddress],
        params: [index.openFundShareSlot],
      })
    ),
  });

  const dailyFees = options.createBalances();
  for (let i = 0; i < pools.length; i++) {
    const poolNavIncrease = todayNavs[i].nav_ - yesterdayNavs[i].nav_;
    const poolBaseInfo = poolBaseInfos[i];
    const shareTotalValue = shareTotalValues[i];

    if (poolNavIncrease <= 0) {
      continue;
    }
    if (shareTotalValue == 0) {
      continue;
    }

    // PoolFee = (ShareTotalValue / 10^(ShareDecimals)) * (PoolNavIncrease / 10^(PoolTokenDecimals)) * 10^(PoolTokenDecimals)
    const poolFee = shareTotalValue * poolNavIncrease / 1e18
    dailyFees.add(poolBaseInfo.currency, poolFee)
  }

  return dailyFees;
}

async function getGraphData(poolId: string[], chain: Chain) {
  const graphUrlList: {
    [chain: Chain]: string;
  } = await getConfig(`solv-fi/graph`, graphUrl);
  const query = `{
              poolOrderInfos(first: 1000  where:{poolId_in: ${JSON.stringify(
    poolId
  )}}) {
                marketContractAddress
                contractAddress
                navOracle
                poolId
                vault
                openFundShareSlot
            }
          }`;
  let response: any;
  if (graphUrlList[chain]) {
    response = (await request(graphUrlList[chain], query)).poolOrderInfos;
  }

  return response;
}

async function concrete(slots: any[], options: FetchOptions): Promise<any> {
  var slotsList: any[] = [];
  var only = {};
  for (var i = 0; i < slots.length; i++) {
    if (!only[slots[i].contractAddress]) {
      slotsList.push(slots[i]);
      only[slots[i].contractAddress] = true;
    }
  }

  const concreteLists = await options.api.multiCall({
    calls: slotsList.map((index) => index.contractAddress),
    abi: "address:concrete",
  });

  let concretes = {};
  for (var k = 0; k < concreteLists.length; k++) {
    concretes[slotsList[k].contractAddress] = concreteLists[k];
  }

  return concretes;
}

async function nativeToken(
  options: FetchOptions,
  contracts: any
): Promise<Balances> {
  if (!contracts[options.chain]["nativeTokenFees"]) {
    return options.createBalances();
  }
  const multisig = contracts[options.chain]["nativeTokenFees"].address;
  return addGasTokensReceived({ multisig, options })
}

async function solanas(options: FetchOptions, contracts: any): Promise<Balances> {
  const solanaFeesConfig = contracts[options.chain]?.solanaFees;
  if (!solanaFeesConfig) {
    return options.createBalances();
  }

  return await getSolanaReceived({ options, targets: solanaFeesConfig });
}

const adapter: SimpleAdapter = { adapter: {}, version: 2 };

Object.keys(chains).forEach((chain: Chain) => {
  adapter.adapter[chain] = {
    fetch,
    start: chains[chain].deployedAt,
  };
});

export default adapter;
