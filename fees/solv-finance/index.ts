import { Chain } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { addGasTokensReceived, addTokensReceived } from "../../helpers/token";
import { Balances } from "@defillama/sdk";
import { getConfig } from "../../helpers/cache";
import BigNumber from "bignumber.js";

const feesConfig =
  "https://raw.githubusercontent.com/solv-finance/solv-protocol-defillama/main/solv-fees-v2.json";

const chains: { [chain: Chain]: { deployedAt: number } } = {
  [CHAIN.ETHEREUM]: { deployedAt: 1726531200 },
  [CHAIN.BSC]: { deployedAt: 1726531200 },
  [CHAIN.ARBITRUM]: { deployedAt: 1726531200 },
  [CHAIN.MANTLE]: { deployedAt: 1726531200 },
  // [CHAIN.MERLIN]: { deployedAt: 1726531200 },
  [CHAIN.CORE]: { deployedAt: 1726531200 },
  [CHAIN.SCROLL]: { deployedAt: 1726531200 },
  [CHAIN.SOLANA]: { deployedAt: 1726531200 },
  [CHAIN.AVAX]: { deployedAt: 1726531200 },
  [CHAIN.BOB]: { deployedAt: 1726531200 },
  [CHAIN.BASE]: { deployedAt: 1726531200 },
  [CHAIN.LINEA]: { deployedAt: 1726531200 },
  [CHAIN.ROOTSTOCK]: { deployedAt: 1726531200 },
  [CHAIN.SONEIUM]: { deployedAt: 1742169600 },
  [CHAIN.INK]: { deployedAt: 1742169600 },
  [CHAIN.BERACHAIN]: { deployedAt: 1742169600 },
};

const fetch: FetchV2 = async (options) => {
  const contracts: {
    [chain: Chain]: Array<{
      name: string;
      marketAddress: string;
      poolId: string;
      openFundShareAddress: string;
      navOracle: string;
      openFundShareSlot: string;
      revenueRatio: string;
      receivedFee?: {
        address: string[];
        token: string[];
        deployedAt: number;
      };
      subscriptionFee: boolean;
      redemptionFee?: {
        address: string[];
        token: string[];
      } | boolean;
      gasTokens?: string[];
    }>;
  } = await getConfig('solv-fi/fees', feesConfig);

  if (!contracts[options.chain])
    return {}

  const { dailyFees, dailyRevenue } = await fees(options, contracts);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

async function fees(options: FetchOptions, contracts: any) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const pools = contracts[options.chain];
  if (!pools)
    return { dailyFees, dailyRevenue };
  const shareConcretes = await concrete(pools, options);
  const fromTimestamp = options.fromTimestamp * 1000;
  const toTimestamp = options.toTimestamp * 1000;

  const [yesterdayNavs, todayNavs, poolBaseInfos, todayShareTotalValues] = await Promise.all([
    options.fromApi.multiCall({
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
      calls: pools.map((pool: { openFundShareAddress: string; openFundShareSlot: string }) => ({
        target: shareConcretes[pool.openFundShareAddress],
        params: [pool.openFundShareSlot],
      })),
    }),
    options.toApi.multiCall({
      abi: "function slotTotalValue(uint256) view returns (uint256)",
      calls: pools.map((pool: { openFundShareAddress: string; openFundShareSlot: string }) => ({
        target: shareConcretes[pool.openFundShareAddress],
        params: [pool.openFundShareSlot],
      })),
    })
  ]);

  const currencyAddresses = poolBaseInfos.map((poolBaseInfo: any) => poolBaseInfo.currency);

  const currencyDecimals = await options.api.multiCall({
    abi: "function decimals() view returns (uint8)",
    calls: currencyAddresses.map((currency: string) => ({
      target: currency,
    })),
  });

  let redemptionFees: { [key: string]: { address: string, token: string } } = {};
  for (let i = 0; i < pools.length; i++) {
    const pool = pools[i];
    const revenueRatio = BigNumber(pool.revenueRatio);
    const subscriptionFee = pool.subscriptionFee;
    const redemptionFee = pool.redemptionFee;
    const receivedFee = pool.receivedFee;
    const receivedFeeGasTokens = pool.receivedFeeGasTokens;

    const yesterdayNav = BigNumber(yesterdayNavs[i].nav_);
    const todayShares = BigNumber(todayShareTotalValues[i]);
    const todayNav = BigNumber(todayNavs[i].nav_);

    const poolBaseInfo = poolBaseInfos[i];

    const currencyDecimal = BigNumber(currencyDecimals[i]);
    const sharesDecimal = BigNumber(10).pow(18);

    if (subscriptionFee) {
      // Calculate subscription fee: daily subscription amount * (nav - 1)
      const subscriptionAmount = await subscriptionFees(options, pool.marketAddress, pool.poolId);
      const subscriptionFeeAmount = BigNumber(subscriptionAmount).times(todayNav.minus(BigNumber(10).pow(currencyDecimal)));
      dailyRevenue.add(poolBaseInfo.currency, subscriptionFeeAmount.div(sharesDecimal).toNumber(), METRIC.MINT_REDEEM_FEES);
    }

    if (redemptionFee) {
      for (const address of redemptionFee.address) {
        for (const token of redemptionFee.token) {
          redemptionFees[`${address.toLowerCase()}-${token.toLowerCase()}`] = {
            address: address,
            token: token,
          };
        }
      }
    }

    if (receivedFee) {
      const receivedFees = await received(options, receivedFee);
      dailyFees.addBalances(receivedFees, METRIC.MINT_REDEEM_FEES);
      dailyRevenue.addBalances(receivedFees.clone(revenueRatio.toNumber()), METRIC.MINT_REDEEM_FEES);
    }

    if (receivedFeeGasTokens) {
      const nativeTokenFees = await gasTokensReceived(options, receivedFeeGasTokens);
      dailyRevenue.addBalances(nativeTokenFees.clone(revenueRatio.toNumber()), METRIC.MINT_REDEEM_FEES);
    }

    // fee = net value increase after on-chain deduction * today's shares / (1 - corresponding fund's revenue_ratio)
    let fee = (todayNav.minus(yesterdayNav)).times(todayShares.div(1e18)).div(BigNumber(1).minus(revenueRatio));
    if (fee.lte(BigNumber(0))) {
      fee = BigNumber(0);
    }

    dailyFees.add(poolBaseInfo.currency, fee.toNumber(), METRIC.STAKING_REWARDS);
    dailyRevenue.add(poolBaseInfo.currency, fee.times(revenueRatio).toNumber(), METRIC.STAKING_REWARDS);
  }

  if (Object.keys(redemptionFees).length > 0) {
    const redemptionFeeAddresses = Object.values(redemptionFees).map(fee => fee.address);
    const redemptionFeeTokens = Object.values(redemptionFees).map(fee => fee.token);

    const redemptionFeeAmount = await received(options, {
      address: redemptionFeeAddresses,
      token: redemptionFeeTokens
    });
    dailyRevenue.addBalances(redemptionFeeAmount, METRIC.MINT_REDEEM_FEES);
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
}

async function received(
  options: FetchOptions,
  contracts: any
): Promise<Balances> {
  return addTokensReceived({
    options,
    targets: contracts.address,
    tokens: contracts.token,
  });
}

async function subscriptionFees(
  options: FetchOptions,
  marketAddress: string,
  poolId: string,
): Promise<number> {
  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();

  const subscribeLogs = await options.getLogs({
    target: marketAddress,
    topics: [
      "0xc51cca244fc8e01ee10b07c39991abc0fcb99dd8650fa53b0797d3e8446451f6", // Subscribe
      poolId,
    ],
    fromBlock,
    toBlock,
  })

  let subscribeTotal = BigNumber(0);
  for (const log of subscribeLogs) {
    const subscribeAmount = parseSubscribeEvent(log.data);
    subscribeTotal = subscribeTotal.plus(subscribeAmount);
  }

  return subscribeTotal.toNumber();
}

function parseSubscribeEvent(data: string): BigNumber {
  const hexData = data.slice(2);

  if (hexData.length >= 192) {
    const valueHex = hexData.slice(64, 96);
    return BigNumber(`0x${valueHex}`);
  }

  return BigNumber(0);
}

async function concrete(pools: any[], options: FetchOptions): Promise<any> {
  var contracts: any[] = [];
  var only: any = {};
  for (var i = 0; i < pools.length; i++) {
    if (!only[pools[i].openFundShareAddress]) {
      contracts.push(pools[i]);
      only[pools[i].openFundShareAddress] = true;
    }
  }

  const concreteLists = await options.api.multiCall({
    calls: contracts.map((contract) => contract.openFundShareAddress),
    abi: "address:concrete",
  });

  let concretes: any = {};
  for (var k = 0; k < concreteLists.length; k++) {
    concretes[contracts[k].openFundShareAddress] = concreteLists[k];
  }

  return concretes;
}

async function gasTokensReceived(
  options: FetchOptions,
  multisigAddress: any
): Promise<Balances> {
  const multisigs = multisigAddress;
  return addGasTokensReceived({ multisigs, options })
}

const methodology = {
  Fees: 'All yields are generated from staking assets and mint/redemption fees.',
  Revenue: 'Mint/Redemption Fees collected by Solv Protocol.',
  ProtocolRevenue: 'Mint/Redemption collected by Solv Protocol.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.STAKING_REWARDS]: 'All yields are generated from staking assets.',
    [METRIC.MINT_REDEEM_FEES]: 'All mint/redemption fees.',
  },
  Revenue: {
    [METRIC.MINT_REDEEM_FEES]: 'Mint/Redemption Fees collected by Solv Protocol.',
  },
  ProtocolRevenue: {
    [METRIC.MINT_REDEEM_FEES]: 'Mint/Redemption Fees collected by Solv Protocol.',
  },
}

const adapter: SimpleAdapter = { adapter: {}, version: 2, methodology, breakdownMethodology };

Object.keys(chains).forEach((chain: Chain) => {
  adapter.adapter![chain] = {
    fetch,
    start: chains[chain].deployedAt,
  };
});

export default adapter;