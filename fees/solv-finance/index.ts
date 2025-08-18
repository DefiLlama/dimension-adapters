import { Chain } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { addGasTokensReceived, addTokensReceived, getSolanaReceived } from "../../helpers/token";
import { request } from "graphql-request";
import { Balances } from "@defillama/sdk";
import { getConfig } from "../../helpers/cache";
import BigNumber from "bignumber.js";
const feesConfig =
  "https://raw.githubusercontent.com/solv-finance/solv-protocol-defillama/main/solv-fees.json";
const graphUrl =
  "https://raw.githubusercontent.com/solv-finance/solv-protocol-defillama/refs/heads/main/solv-graph.json";
const yields = 0.2;

const chains: { [chain: Chain]: { deployedAt: number } } = {
  [CHAIN.ETHEREUM]: { deployedAt: 1726531200 },
  [CHAIN.BSC]: { deployedAt: 1726531200 },
  [CHAIN.ARBITRUM]: { deployedAt: 1726531200 },
  [CHAIN.MANTLE]: { deployedAt: 1726531200 },
  [CHAIN.MERLIN]: { deployedAt: 1726531200 },
  // [CHAIN.CORE]: { deployedAt: 1726531200 },
  [CHAIN.SCROLL]: { deployedAt: 1726531200 },
  [CHAIN.SOLANA]: { deployedAt: 1726531200 },
  [CHAIN.AVAX]: { deployedAt: 1726531200 },
  [CHAIN.BOB]: { deployedAt: 1726531200 },
  [CHAIN.BASE]: { deployedAt: 1726531200 },
  [CHAIN.LINEA]: { deployedAt: 1726531200 },
  [CHAIN.ROOTSTOCK]: { deployedAt: 1726531200 },
  [CHAIN.SONEIUM]: { deployedAt: 1742169600 },
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


  const { dailyFees, dailyProtocolRevenue } = await feeRevenues(options, contracts);
  const dailyRevenue = await revenues(options, contracts);
  const pureRevenueBalances = await pureRevenues(options, contracts);

  dailyFees.addBalances(pureRevenueBalances);
  dailyRevenue.addBalances(pureRevenueBalances);
  dailyRevenue.addBalances(dailyProtocolRevenue);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

async function pureRevenues(options: FetchOptions, contracts: any): Promise<Balances> {
  const pureRevenues = options.createBalances();

  const receivedPureRevenue = await received(options, contracts, "receivedPureRevenue");
  pureRevenues.addBalances(receivedPureRevenue);

  const nativeTokenPureRevenue = await nativeToken(options, contracts, "nativeTokenPureRevenue");
  pureRevenues.addBalances(nativeTokenPureRevenue);

  return pureRevenues;
}

async function revenues(options: FetchOptions, contracts: any): Promise<Balances> {
  const dailyRevenues = options.createBalances();

  const receivedRevenue = await received(options, contracts, "receivedRevenue");
  dailyRevenues.addBalances(receivedRevenue);

  const nativeTokenRevenue = await nativeToken(options, contracts, "nativeTokenRevenue");
  dailyRevenues.addBalances(nativeTokenRevenue);

  const solanaRevenue = await solanas(options, contracts, "solanaRevenue");
  dailyRevenues.addBalances(solanaRevenue);

  return dailyRevenues;
}

async function feeRevenues(options: FetchOptions, contracts: any): Promise<{ dailyFees: Balances, dailyProtocolRevenue: Balances }> {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const protocolFees = await received(options, contracts, "protocolFees");
  dailyFees.addBalances(protocolFees);
  const { dailyFees: poolFees, depositFees } = await pool(options, contracts, "poolFees");
  dailyFees.addBalances(poolFees);
  dailyProtocolRevenue.addBalances(depositFees);

  const nativeTokenFees = await nativeToken(options, contracts, "nativeTokenFees");
  dailyFees.addBalances(nativeTokenFees);
  dailyProtocolRevenue.addBalances(nativeTokenFees.clone(yields));

  const solanaFees = await solanas(options, contracts, "solanaFees");
  dailyFees.addBalances(solanaFees);
  dailyProtocolRevenue.addBalances(solanaFees.clone(yields));

  return { dailyFees, dailyProtocolRevenue };
}

async function received(
  options: FetchOptions,
  contracts: any,
  configKey: string
): Promise<Balances> {
  const protocolConfig = contracts[options.chain]?.[configKey];
  if (!protocolConfig) {
    return options.createBalances();
  }
  return addTokensReceived({
    options,
    targets: protocolConfig.address,
    tokens: protocolConfig.token,
  });
}

async function pool(options: FetchOptions, contracts: any, configKey: string): Promise<{ dailyFees: Balances, depositFees: Balances }> {
  const poolConfig = contracts[options.chain]?.[configKey];
  if (!poolConfig) {
    return { dailyFees: options.createBalances(), depositFees: options.createBalances() };
  }

  const pools = await getGraphData(
    poolConfig.map((pool: { poolId: string }) => pool.poolId),
    options.chain
  );
  const shareConcretes = await concrete(pools, options);

  const fromTimestamp = options.fromTimestamp * 1000;
  const toTimestamp = options.toTimestamp * 1000;

  const [yesterdayNavs, todayNavs, poolBaseInfos, yesterdayShareTotalValues, todayShareTotalValues, currencyDecimals] = await Promise.all([options.fromApi.multiCall({
    abi: "function getSubscribeNav(bytes32 poolId_, uint256 time_) view returns (uint256 nav_, uint256 navTime_)",
    calls: pools.map((pool: { navOracle: string; poolId: string }) => ({
      target: pool.navOracle,
      params: [pool.poolId, fromTimestamp],
    })),
  }),
  options.toApi.multiCall({
    abi: "function getSubscribeNav(bytes32 poolId_, uint256 time_) view returns (uint256 nav_, uint256 navTime_)",
    calls: pools.map((pool: { navOracle: string; poolId: string }) => ({
      target: pool.navOracle,
      params: [pool.poolId, toTimestamp],
    })),
  }),
  options.api.multiCall({
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
  }),
  options.fromApi.multiCall({
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
  }),
  options.toApi.multiCall({
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
  }),
  options.api.multiCall({
    abi: "function decimals() view returns (uint8)",
    calls: pools.map((pool: { currency: string }) => ({
      target: pool.currency,
    })),
  })]);

  const dailyFees = options.createBalances();
  const depositFees = options.createBalances();
  for (let i = 0; i < pools.length; i++) {
    const pool = poolConfig[i];
    const revenue_ratio = pool.revenue_ratio;

    const yesterdayNav = BigNumber(yesterdayNavs[i].nav_);
    const todayShares = BigNumber(todayShareTotalValues[i]);

    const todayNav = BigNumber(todayNavs[i].nav_);
    const yesterdayShares = BigNumber(yesterdayShareTotalValues[i]);

    if (todayShares.isZero() || yesterdayShares.isZero()) {
      continue;
    }

    const poolBaseInfo = poolBaseInfos[i];

    const currencyDecimal = currencyDecimals[i];

    let depositFee = (BigNumber(todayShares).minus(BigNumber(yesterdayShares))).div(BigNumber(todayNav).minus(BigNumber(1).pow(currencyDecimal)));

    let fee = (todayNav.times(todayShares).minus(yesterdayNav.times(yesterdayShares))).div(BigNumber(1).minus(revenue_ratio));
    let poolFee = BigNumber(0);

    if (fee.lte(0) || depositFee.lte(0)) {
      fee = BigNumber(0);
      depositFee = BigNumber(0);
    } else {
      fee = fee.div(BigNumber(10).pow(18));
      depositFee = depositFee.div(BigNumber(10).pow(18));
      poolFee = fee.times(revenue_ratio);
    }

    dailyFees.add(poolBaseInfo.currency, fee.toNumber());
    depositFees.add(poolBaseInfo.currency, depositFee.plus(poolFee).toNumber());
  }

  return { dailyFees, depositFees };
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
  contracts: any, configKey: string
): Promise<Balances> {
  const nativeTokenConfig = contracts[options.chain]?.[configKey];
  if (!nativeTokenConfig) {
    return options.createBalances();
  }
  const multisig = nativeTokenConfig.address;
  return addGasTokensReceived({ multisig, options })
}

async function solanas(options: FetchOptions, contracts: any, configKey: string): Promise<Balances> {
  const solanaFeesConfig = contracts[options.chain]?.[configKey];
  if (!solanaFeesConfig) {
    return options.createBalances();
  }

  return await getSolanaReceived({ options, targets: solanaFeesConfig });
}

const meta = {
  methodology: {
    Fees: 'All yields are generated from staking assets.',
    Revenue: 'Fees collected by Solv Protocol.',
    ProtocolRevenue: 'Fees collected by Solv Protocol.',
  }
}

const adapter: SimpleAdapter = { adapter: {}, version: 2 };

Object.keys(chains).forEach((chain: Chain) => {
  adapter.adapter[chain] = {
    meta,
    fetch,
    start: chains[chain].deployedAt,
  };
});

export default adapter;