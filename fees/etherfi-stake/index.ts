// https://etherfi.gitbook.io/etherfi
import * as sdk from "@defillama/sdk";
import { Adapter, Dependencies, FetchOptions, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ethers } from "ethers";
import ADDRESSES from "../../helpers/coreAssets.json";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

const EETH = ADDRESSES.ethereum.EETH;
const EIGEN = ADDRESSES.ethereum.EIGEN;
const LIQUIDITY_POOL = "0x308861A430be4cce5502d0A12724771Fc6DaF216";
const STETH = ADDRESSES.ethereum.STETH;
const SSV = "0x9D65fF81a3c488d585bBfb0Bfe3c7707c7917f54";
const OBOL = "0x0B010000b7624eb9B3DfBC279673C76E9D29D5F7";
const YEAR = 365;

const accountStateV1Abi =
  "function accountantState() view returns (address payoutAddress, uint96 highwaterMark, uint128 feesOwedInBase, uint128 totalSharesLastUpdate, uint96 exchangeRate, uint16 allowedExchangeRateChangeUpper, uint16 allowedExchangeRateChangeLower, uint64 lastUpdateTimestamp, bool isPaused, uint24 minimumUpdateDelayInSeconds, uint16 platformFee, uint16)";
const accountStateV2Abi =
  "function accountantState() view returns (address payoutAddress, uint128 feesOwedInBase, uint128 totalSharesLastUpdate, uint96 exchangeRate, uint16 allowedExchangeRateChangeUpper, uint16 allowedExchangeRateChangeLower, uint64 lastUpdateTimestamp, bool isPaused, uint32 minimumUpdateDelayInSeconds, uint16 managementFee)";

const LABELS = {
  stETH_STAKING_REWARDS: "stETH Staking Rewards",
  EIGEN_STAKING_REWARDS: "EigenLayer Staking Rewards",
  SSV_STAKING_REWARDS: "SSV Staking Rewards",
  OBOL_STAKING_REWARDS: "Obol Staking Rewards",
  ETH_STAKING_REWARDS: "Core ETH Staking Rewards",
  TOKEN_BUY_BACK: METRIC.TOKEN_BUY_BACK,
};

const getStethFees = async (options: FetchOptions, totalSteth: number) => {
  const stethRebaseLogs = await options.getLogs({
    target: STETH,
    eventAbi:
      "event TokenRebased(uint256 indexed reportTimestamp,uint256 timeElapsed,uint256 preTotalShares,uint256 preTotalEther,uint256 postTotalShares,uint256 postTotalEther,uint256 sharesMintedAsFees)",
  });
  const lastRebaseLog = stethRebaseLogs[0];
  const exchangeRateBefore =
    Number(lastRebaseLog.preTotalEther) / Number(lastRebaseLog.preTotalShares);
  const exchangeRateAfter =
    Number(lastRebaseLog.postTotalEther) / Number(lastRebaseLog.postTotalShares);
  const stethShares = totalSteth / exchangeRateBefore;
  const changeInSteth = stethShares * exchangeRateAfter - stethShares * exchangeRateBefore;
  return changeInSteth;
};

const getTotalSteth = async (options: FetchOptions) => {
  //steth or steth derivative holding
  const WSTETH = ADDRESSES.ethereum.WSTETH;
  const STETH = ADDRESSES.ethereum.STETH;
  const KARAK_WSTETH = "0xa3726beDFD1a8AA696b9B4581277240028c4314b";
  const SYMBIOTIC_WSTETH = "0xC329400492c6ff2438472D4651Ad17389fCb843a";
  const DEVAMP = "0x9FFDF407cDe9a93c47611799DA23924Af3EF764F";
  const WEETHS = "0x917ceE801a67f933F2e6b33fC0cD1ED2d5909D88";
  const WEETHK = "0x7223442cad8e9cA474fC40109ab981608F8c4273";
  const WEETHK_HOLDER = "0xFdc479a18d06e2721d17024b549f3f6173a68805";
  const GWEI = 1000000000;
  const wstethExchangeRate = await options.api.call({
    target: WSTETH,
    abi: "function getStETHByWstETH(uint256 _wstETHAmount) external view returns (uint256)",
    params: [1000000000],
  });

  const STETH_HOLDERS = [DEVAMP, WEETHS, WEETHK];
  var totalSteth = BigInt(0);
  for (const holder of STETH_HOLDERS) {
    const stethHolding = await options.api.call({
      target: STETH,
      abi: "function balanceOf(address account) external view returns (uint256)",
      params: [holder],
    });
    let wstethHolding = await options.api.call({
      target: WSTETH,
      abi: "function balanceOf(address account) external view returns (uint256)",
      params: [holder],
    });

    totalSteth =
      BigInt(totalSteth) +
      BigInt(stethHolding) +
      (BigInt(wstethHolding) * BigInt(wstethExchangeRate)) / BigInt(GWEI);
  }

  let restakedWstethSymbiotic = await options.api.call({
    target: SYMBIOTIC_WSTETH,
    abi: "function balanceOf(address account) external view returns (uint256)",
    params: [WEETHS],
    permitFailure: true,
  });
  let restakedWstethKarak = await options.api.call({
    target: KARAK_WSTETH,
    abi: "function balanceOf(address account) external view returns (uint256)",
    params: [WEETHK_HOLDER],
    permitFailure: true,
  });

  restakedWstethSymbiotic = restakedWstethSymbiotic || 0;
  restakedWstethKarak = restakedWstethKarak || 0;

  totalSteth =
    totalSteth +
    BigInt(
      (restakedWstethSymbiotic * wstethExchangeRate) / GWEI +
        (restakedWstethKarak * wstethExchangeRate) / GWEI,
    );
  return Number(totalSteth);
};

const getSsvRevenue = async (options: FetchOptions) => {
  const logs = await options.getLogs({
    target: SSV,
    eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      null as any,
      ethers.zeroPadValue("0xd1208cC82765aA4dc696117D26f37388B6Dcb6D5", 32),
    ],
  });
  let ssv_revenue = 0;
  for (const log of logs) {
    if (log.from.toLowerCase() === "0x8fb66F38cF86A3d5e8768f8F1754A24A6c661Fb8".toLowerCase()) {
      ssv_revenue += +Number(log.value);
    } else {
      ssv_revenue += +Number(log.value) * 0.8;
    }
  }
  return BigInt(ssv_revenue);
};

const getObolRevenue = async (options: FetchOptions) => {
  const logs = await options.getLogs({
    target: OBOL,
    eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      null as any,
      ethers.zeroPadValue("0x0c83EAe1FE72c390A02E426572854931EefF93BA", 32),
    ],
  });
  const obol_revenue = logs.reduce((acc, log) => acc + Number(log.value), 0);
  return BigInt(obol_revenue);
};

const getMiscStakingRevenue = async (options: FetchOptions) => {
  const logs = await options.getLogs({
    target: "0x35fA164735182de50811E8e2E824cFb9B6118ac2", //eETH as WETH
    eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      null as any,
      ethers.zeroPadValue("0x0c83EAe1FE72c390A02E426572854931EefF93BA", 32),
    ],
  });
  const logs2 = await options.getLogs({
    target: EIGEN,
    eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      null as any,
      ethers.zeroPadValue("0x0c83EAe1FE72c390A02E426572854931EefF93BA", 32),
    ],
  });

  const wethRevenue = logs.reduce((acc, log) => acc + Number(log.value), 0);
  const eigenRevenue = logs2.reduce((acc, log) => acc + Number(log.value), 0);
  return {
    wethRevenue: BigInt(wethRevenue),
    eigenRevenue: BigInt(eigenRevenue),
  };
};
const getAdditionalRevenueStreams = async (options: FetchOptions) => {
  const query = `
    with 
    
    -- Restaking rewards from Eigenlayer via restaker contract
    restaking_rewards as (
        select 
            'restaking_rewards' as revenue_source,
            sum(((0.035 * token_balance_usd) * 0.038)/365) as revenue_usd
        from 
        dune.ether_fi.result_aum
        where address in (0x1B7a4C3797236A1C37f8741c0Be35c2c72736fFf, 0x917cee801a67f933f2e6b33fc0cd1ed2d5909d88)
        and lower(token_symbol) like '%steth%'
        and day = date(from_unixtime(${options.startOfDay})) 
        and token_balance_usd > 0
    ),

     -- ether.fi buybacks (counted as holders revenue)
     buybacks as (
         select 
             'buybacks' as revenue_source,
             sum(amount_usd) as revenue_usd
         from (
             select 
                 amount_usd
             from 
             dex_aggregator.trades 
             where blockchain = 'ethereum'
             and taker = 0x2f5301a3D59388c509C65f8698f521377D41Fd0F 
             and TIME_RANGE

             union all 

             select 
                 amount_usd
             from (
                 values 
                     ('offchain', cast('2024-07-31' as timestamp), 'ETHFI', 64824.120603, 'USDC', 129000, 129000, 0x, 0x),
                     ('offchain', cast('2024-08-31' as timestamp), 'ETHFI', 83333.3333333, 'USDC', 110000, 110000, 0x, 0x),
                     ('offchain', cast('2024-09-30' as timestamp), 'ETHFI', 48295.4545455, 'USDC', 85000, 85000, 0x, 0x),
                     ('offchain', cast('2024-10-31' as timestamp), 'ETHFI', 81944.4444444, 'USDC', 118000, 118000, 0x, 0x),
                     ('offchain', cast('2024-11-30' as timestamp), 'ETHFI', 68093.385214, 'USDC', 175000, 175000, 0x, 0x),
                     ('offchain', cast('2024-12-31' as timestamp), 'ETHFI', 82949.3087558, 'USDC', 180000, 180000, 0x, 0x),
                     ('offchain', cast('2025-01-31' as timestamp), 'ETHFI', 100000, 'USDC', 165000, 165000, 0x, 0x),
                     ('offchain', cast('2025-02-28' as timestamp), 'ETHFI', 126429.975704, 'USDC', 120000, 120000, 0x, 0x),
                     ('offchain', cast('2025-03-31' as timestamp), 'ETHFI', 181716.860902, 'USDC', 105000, 105000, 0x, 0x),
                     ('offchain', cast('2025-04-30' as timestamp), 'ETHFI', 203245.147522, 'USDC', 120000, 120000, 0x, 0x)
             ) as tmp_table (project, block_time, token_bought_symbol, token_bought_amount, token_sold_symbol, token_sold_amount, amount_usd, taker, tx_hash)
             where block_time >= from_unixtime(${options.startTimestamp})
             and block_time < from_unixtime(${options.endTimestamp})
         )
     )
     
     -- Combine all revenue sources
     select revenue_source, revenue_usd from restaking_rewards
     union all
     select revenue_source, revenue_usd from buybacks`;

  const result = await queryDuneSql(options, query);
  const revenues = {
    restakingRewards: 0,
    buybacks: 0,
  };

  if (result && result.length > 0) {
    result.forEach((row: any) => {
      switch (row.revenue_source) {
        case "restaking_rewards":
          revenues.restakingRewards = Number(row.revenue_usd || 0);
          break;
        case "buybacks":
          revenues.buybacks = Number(row.revenue_usd || 0);
          break;
      }
    });
  }
  return revenues;
};

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const totalSteth = await getTotalSteth(options);

  // Core ETH staking protocol fees
  let totalStakeFees = BigInt(0);
  const protocolFeesLog = await options.getLogs({
    target: LIQUIDITY_POOL,
    eventAbi: "event ProtocolFeePaid(uint128 protocolFees)",
  });
  for (const log of protocolFeesLog) totalStakeFees += log.protocolFees;

  const stethFees = await getStethFees(options, totalSteth);
  const stethRevenue = (((totalSteth * 3.5) / 100) * 0.025) / 365;

  // Eigenlayer restaking rewards claimed weekly on Optimism L2
  const optimismApi = new sdk.ChainApi({ chain: "optimism" });
  const restakingRewardsEigen = BigInt(
    await optimismApi.call({
      target: "0xAB7590CeE3Ef1A863E9A5877fBB82D9bE11504da",
      abi: "function categoryTVL(string _category) view returns (uint256)",
      params: [EIGEN],
    }),
  );
  const eigenFeesTotal = restakingRewardsEigen / BigInt(7);
  const eigenRevenueShare = (restakingRewardsEigen / BigInt(7 * 90)) * BigInt(10);
  dailyFees.add(EIGEN, eigenFeesTotal, LABELS.EIGEN_STAKING_REWARDS);
  dailyRevenue.add(EIGEN, eigenRevenueShare, LABELS.EIGEN_STAKING_REWARDS);
  dailySupplySideRevenue.add(
    EIGEN,
    eigenFeesTotal - eigenRevenueShare,
    LABELS.EIGEN_STAKING_REWARDS,
  );

  const ssvRevenue = await getSsvRevenue(options);
  dailyFees.add(SSV, ssvRevenue, LABELS.SSV_STAKING_REWARDS);
  dailyRevenue.add(SSV, ssvRevenue, LABELS.SSV_STAKING_REWARDS);

  const obolRevenue = await getObolRevenue(options);
  dailyFees.add(OBOL, obolRevenue, LABELS.OBOL_STAKING_REWARDS);
  dailyRevenue.add(OBOL, obolRevenue, LABELS.OBOL_STAKING_REWARDS);

  const { wethRevenue, eigenRevenue } = await getMiscStakingRevenue(options);
  dailyFees.add(EETH, wethRevenue, LABELS.EIGEN_STAKING_REWARDS);
  dailyRevenue.add(EETH, wethRevenue, LABELS.EIGEN_STAKING_REWARDS);
  dailyFees.add(EIGEN, eigenRevenue, LABELS.EIGEN_STAKING_REWARDS);
  dailyRevenue.add(EIGEN, eigenRevenue, LABELS.EIGEN_STAKING_REWARDS);

  const additionalRevenues = await getAdditionalRevenueStreams(options);
  if (additionalRevenues.restakingRewards > 0) {
    dailyFees.addUSDValue(additionalRevenues.restakingRewards, LABELS.EIGEN_STAKING_REWARDS);
    dailyRevenue.addUSDValue(additionalRevenues.restakingRewards, LABELS.EIGEN_STAKING_REWARDS);
  }
  if (additionalRevenues.buybacks > 0) {
    dailyHoldersRevenue.addUSDValue(additionalRevenues.buybacks, METRIC.TOKEN_BUY_BACK);
  }

  // stETH holding rewards from Lido rebasing
  dailyFees.add(STETH, stethFees + stethRevenue, LABELS.stETH_STAKING_REWARDS);
  dailyRevenue.add(STETH, stethRevenue, LABELS.stETH_STAKING_REWARDS);
  dailySupplySideRevenue.add(STETH, stethFees, LABELS.stETH_STAKING_REWARDS);

  // Core staking protocol fees from eETH staking operations
  dailyRevenue.add(EETH, totalStakeFees, LABELS.ETH_STAKING_REWARDS);
  dailyFees.add(EETH, totalStakeFees * BigInt(10), LABELS.ETH_STAKING_REWARDS);
  dailySupplySideRevenue.add(EETH, totalStakeFees * BigInt(9), LABELS.ETH_STAKING_REWARDS);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  dependencies: [Dependencies.DUNE],
  start: "2024-03-13",
  methodology: {
    Fees: "Total rewards from ether.fi staking services: ETH staking, EigenLayer restaking, stETH rebasing, SSV/OBOL validator operations.",
    Revenue: "Protocol's share of staking and restaking fees.",
    ProtocolRevenue: "Same as Revenue.",
    SupplySideRevenue: "Portion of fees distributed to stakers, users, and liquidity providers.",
    HoldersRevenue: "ETHFI token buybacks executed by ether.fi.",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.ETH_STAKING_REWARDS]: "All rewards from core ETH staking.",
      [LABELS.EIGEN_STAKING_REWARDS]: "All rewards from EigenLayer staking & restaking.",
      [LABELS.stETH_STAKING_REWARDS]: "All rewards from stETH holding.",
      [LABELS.SSV_STAKING_REWARDS]: "All rewards from SSV network staking.",
      [LABELS.OBOL_STAKING_REWARDS]: "All rewards from Obol network staking.",
    },
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: "ETHFI token buybacks executed by ether.fi.",
    },
  },
};

export default adapter;
