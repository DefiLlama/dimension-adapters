import { Chain } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { addGasTokensReceived, addTokensReceived, getSolanaReceived } from "../../helpers/token";
import { Balances } from "@defillama/sdk";
import { getConfig } from "../../helpers/cache";
import BigNumber from "bignumber.js";

const feesConfig =
  "https://raw.githubusercontent.com/solv-finance/solv-protocol-defillama/main/solv-fees-new.json";
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
    [chain: Chain]: Array<{
      name: string;
      marketAddress: string;
      poolId: string;
      contractAddress: string;
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

async function fees(options: FetchOptions, contracts: any): Promise<{ dailyFees: Balances, dailyRevenue: Balances }> {
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
      calls: pools.map((pool: { contractAddress: string; openFundShareSlot: string }) => ({
        target: shareConcretes[pool.contractAddress],
        params: [pool.openFundShareSlot],
      })),
    }),
    options.toApi.multiCall({
      abi: "function slotTotalValue(uint256) view returns (uint256)",
      calls: pools.map((pool: { contractAddress: string; openFundShareSlot: string }) => ({
        target: shareConcretes[pool.contractAddress],
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

  for (let i = 0; i < pools.length; i++) {
    const pool = pools[i];
    const revenueRatio = BigNumber(pool.revenueRatio);
    const subscriptionFee = pool.subscriptionFee;
    const redemptionFee = pool.redemptionFee;
    const receivedFee = pool.receivedFee;
    const gasTokens = pool.gasTokens;

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
      dailyRevenue.add(poolBaseInfo.currency, subscriptionFeeAmount.div(sharesDecimal).toNumber());
    }

    if (redemptionFee) {
      let redemptionFees = await received(options, redemptionFee);
      dailyRevenue.addBalances(redemptionFees);
    }

    if (receivedFee) {
      const receivedFees = await received(options, receivedFee);
      dailyFees.addBalances(receivedFees);
      dailyRevenue.addBalances(receivedFees.clone(yields));
    }

    if (gasTokens) {
      const nativeTokenFees = await gasTokensReceived(options, gasTokens);
      dailyRevenue.addBalances(nativeTokenFees.clone(yields));
    }

    // fee = net value increase after on-chain deduction * today's shares / (1 - corresponding fund's revenue_ratio)
    let fee = (todayNav.minus(yesterdayNav)).times(todayShares).div(BigNumber(1).minus(revenueRatio));
    if (fee.lte(BigNumber(0))) {
      fee = BigNumber(0);
    } else {
      dailyRevenue.add(poolBaseInfo.currency, fee.times(revenueRatio).toNumber());
      fee = fee.div(sharesDecimal);
    }

    dailyFees.add(poolBaseInfo.currency, fee.toNumber());
  }

  return { dailyFees, dailyRevenue };
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

  const [subscribeLogs, requestRedeemLogs, revokeRedeemLogs] = await Promise.all([
    options.getLogs({
      target: marketAddress,
      topics: [
        "0xc51cca244fc8e01ee10b07c39991abc0fcb99dd8650fa53b0797d3e8446451f6", // Subscribe
        poolId,
      ],
      fromBlock,
      toBlock,
    }),
    options.getLogs({
      target: marketAddress,
      topics: [
        "0x7b643ca1af436c1321536413ea4e5d302421a825be5ca49aaaba4583c09bd906", // RequestRedeem
        poolId,
      ],
      fromBlock,
      toBlock,
    }),
    options.getLogs({
      target: marketAddress,
      topics: [
        "0x1d1d9dc1cf42a6e6d9c7cd77a670b1ca2af37ce238872f36e794f163a45cc313", // RevokeRedeem
        poolId,
      ],
      fromBlock,
      toBlock,
    })
  ]);

  let subscribeTotal = BigNumber(0);
  for (const log of subscribeLogs) {
    const subscribeAmount = parseSubscribeEvent(log.data);
    subscribeTotal = subscribeTotal.plus(subscribeAmount);
  }

  let requestRedeemTotal = BigNumber(0);
  for (const log of requestRedeemLogs) {
    const redeemAmount = parseRequestRedeemEvent(log.data);
    requestRedeemTotal = requestRedeemTotal.plus(redeemAmount);
  }

  let revokeRedeemTotal = BigNumber(0);
  for (const log of revokeRedeemLogs) {
    const revokeAmount = await getRevokeRedeemAmount(log, requestRedeemLogs);
    revokeRedeemTotal = revokeRedeemTotal.plus(revokeAmount);
  }

  const netSubscription = subscribeTotal.minus(requestRedeemTotal).plus(revokeRedeemTotal);

  if (netSubscription.lte(0)) {
    return 0;
  }
  return netSubscription.toNumber();
}

function parseSubscribeEvent(data: string): BigNumber {
  const hexData = data.slice(2);

  if (hexData.length >= 192) {
    const valueHex = hexData.slice(64, 96);
    return BigNumber(`0x${valueHex}`);
  }

  return BigNumber(0);
}

function parseRequestRedeemEvent(data: string): BigNumber {
  const hexData = data.slice(2);

  if (hexData.length >= 128) {
    const redeemValueHex = hexData.slice(96, 128);
    return BigNumber(`0x${redeemValueHex}`);
  }

  return BigNumber(0);
}

async function getRevokeRedeemAmount(
  revokeLog: any,
  requestRedeemLogs: any[]
): Promise<BigNumber> {
  const hexData = revokeLog.data.slice(2);
  if (hexData.length < 128) {
    return BigNumber(0);
  }

  const redemptionIdHex = hexData.slice(64, 96);
  const redemptionId = BigNumber(`0x${redemptionIdHex}`);

  const matchingLog = requestRedeemLogs.find(log => {
    const logHexData = log.data.slice(2);
    if (logHexData.length >= 128) {
      const logRedemptionId = BigNumber(`0x${logHexData.slice(64, 96)}`);
      return logRedemptionId.eq(redemptionId);
    }
    return false;
  });

  if (matchingLog) {
    return parseRequestRedeemEvent(matchingLog.data);
  }

  return BigNumber(0);
}

async function concrete(pools: any[], options: FetchOptions): Promise<any> {
  var contracts: any[] = [];
  var only = {};
  for (var i = 0; i < pools.length; i++) {
    if (!only[pools[i].contractAddress]) {
      contracts.push(pools[i]);
      only[pools[i].contractAddress] = true;
    }
  }

  const concreteLists = await options.api.multiCall({
    calls: contracts.map((contract) => contract.contractAddress),
    abi: "address:concrete",
  });

  let concretes = {};
  for (var k = 0; k < concreteLists.length; k++) {
    concretes[contracts[k].contractAddress] = concreteLists[k];
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