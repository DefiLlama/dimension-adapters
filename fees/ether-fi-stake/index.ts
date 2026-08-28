import * as sdk from "@defillama/sdk";
import { Adapter, Dependencies, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ethers } from "ethers";
import ADDRESSES from '../../helpers/coreAssets.json';
import { queryDuneSql } from '../../helpers/dune';
import { METRIC } from "../../helpers/metrics";

const EETH = ADDRESSES.ethereum.EETH;
const EIGEN = ADDRESSES.ethereum.EIGEN;
const LIQUIDITY_POOL = "0x308861A430be4cce5502d0A12724771Fc6DaF216";
const STETH = ADDRESSES.ethereum.STETH;
const SSV = "0x9D65fF81a3c488d585bBfb0Bfe3c7707c7917f54";
const OBOL = "0x0B010000b7624eb9B3DfBC279673C76E9D29D5F7";

const MetricLabels = {
  WITHDRAW_FEES: 'Vault Withdraw Fees',
  stETH_STAKING_REWARDS: 'Restaker stETH Staking Rewards',
  EIGEN_STAKING_REWARDS: 'EigenLayer Staking Rewards',
  SSV_STAKING_REWARDS: 'SSV Staking Rewards',
  OBOL_STAKING_REWARDS: 'Obol Staking Rewards',
  ETH_STAKING_REWARDS: 'Core ETH Staking Rewards',
  TOKEN_BUY_BACK: METRIC.TOKEN_BUY_BACK,
}

const getStethFees = async (options: FetchOptions, totalSteth: number) => {
  const stethRebaseLogs = await options.getLogs({
    target: STETH,
    eventAbi: "event TokenRebased(uint256 indexed reportTimestamp,uint256 timeElapsed,uint256 preTotalShares,uint256 preTotalEther,uint256 postTotalShares,uint256 postTotalEther,uint256 sharesMintedAsFees)",
  });
  if (stethRebaseLogs.length === 0) return 0;
  const lastRebaseLog = stethRebaseLogs[stethRebaseLogs.length - 1];
  const exchangeRateBefore = Number(lastRebaseLog.preTotalEther) / Number(lastRebaseLog.preTotalShares);
  const exchangeRateAfter = Number(lastRebaseLog.postTotalEther) / Number(lastRebaseLog.postTotalShares);
  const stethShares = totalSteth / exchangeRateBefore
  const changeInSteth = (stethShares * exchangeRateAfter) - (stethShares * exchangeRateBefore);
  return changeInSteth;
};

const getTotalSteth = async (options: FetchOptions) => {
  //steth or steth derivative holding
  const WSTETH = ADDRESSES.ethereum.WSTETH
  const STETH = ADDRESSES.ethereum.STETH
  const DEVAMP = "0x9FFDF407cDe9a93c47611799DA23924Af3EF764F"
  const GWEI = 1000000000
  const wstethExchangeRate = (await options.api.call({
    target: WSTETH,
    abi: "function getStETHByWstETH(uint256 _wstETHAmount) external view returns (uint256)",
    params: [1000000000],
  }));

  const STETH_HOLDERS = [DEVAMP]
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

    totalSteth = BigInt(totalSteth) + BigInt(stethHolding) + BigInt(wstethHolding) * BigInt(wstethExchangeRate) / BigInt(GWEI);
  }

  return Number(totalSteth);
};

const getSsvRevenue = async (options: FetchOptions) => {
  const logs = await options.getLogs({
    target: SSV,
    eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
    topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", null as any, ethers.zeroPadValue("0xd1208cC82765aA4dc696117D26f37388B6Dcb6D5", 32)],
  })
  // Transfers from the dedicated fee recipient are 100% protocol;
  // everything else has an 80% protocol cut (4/5 in integer math).
  return logs.reduce((acc: bigint, log: any) => {
    const value = BigInt(log.value);
    const fromFeeRecipient = log.from.toLowerCase() === "0x8fb66F38cF86A3d5e8768f8F1754A24A6c661Fb8".toLowerCase();
    return acc + (fromFeeRecipient ? value : (value * 4n) / 5n);
  }, 0n);
}

const getObolRevenue = async (options: FetchOptions) => {
  const logs = await options.getLogs({
    target: OBOL,
    eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
    topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", null as any, ethers.zeroPadValue("0x0c83EAe1FE72c390A02E426572854931EefF93BA", 32)],
  })
  return logs.reduce((acc: bigint, log: any) => acc + BigInt(log.value), 0n);
}

const getWithdrawalFees = async (options: FetchOptions) => {
  const logs = await options.getLogs({
    target: EETH,
    eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
    topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", ethers.zeroPadValue("0x7d5706f6ef3F89B3951E23e557CDFBC3239D4E2c", 32), ethers.zeroPadValue("0x2f5301a3D59388c509C65f8698f521377D41Fd0F", 32)],
  })
  return logs.reduce((acc: bigint, log: any) => acc + BigInt(log.value), 0n);
}

const getMiscStakingRevenue = async (options: FetchOptions) => {
  const logs = await options.getLogs({
    target: "0x35fA164735182de50811E8e2E824cFb9B6118ac2", //eETH as WETH
    eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
    topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", null as any, ethers.zeroPadValue("0x0c83EAe1FE72c390A02E426572854931EefF93BA", 32)],
  });
  const logs2 = await options.getLogs({
    target: EIGEN,
    eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
    topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", null as any, ethers.zeroPadValue("0x0c83EAe1FE72c390A02E426572854931EefF93BA", 32)],
  });

  const wethRevenue = logs.reduce((acc: bigint, log: any) => acc + BigInt(log.value), 0n);
  const eigenRevenue = logs2.reduce((acc: bigint, log: any) => acc + BigInt(log.value), 0n);
  return { wethRevenue, eigenRevenue };
}

const getAdditionalRevenueStreams = async (options: FetchOptions) => {
  const query = `
     select
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
     )`;

  const result = await queryDuneSql(options, query);
  return { buybacks: Number(result?.[0]?.revenue_usd || 0) };
}

/**
 * EtherFi Staking Revenue Stream Categories:
 *
 * STAKING_REWARDS: Consolidated category including:
 *   - Core ETH staking protocol fees (10% to protocol, 90% to stakers)
 *   - Eigenlayer restaking rewards from L2 claims (~11% to protocol, rest to stakers)
 *   - Restaking rewards from stETH holdings in restaker contracts (protocol only)
 *   - Lido stETH rebasing rewards (2.5% to protocol, rest to stakers)
 *   - SSV/OBOL rewards for running validators (protocol only)
 *   - Direct token transfers and miscellaneous earnings (protocol only)
 *
 * DEPOSIT_WITHDRAW_FEES: Withdrawal fees from vault operations (protocol only)
 * TOKEN_BUY_BACK: ETHFI buybacks benefiting token holders (holders revenue)
 *
 * Note: Different revenue streams have different protocol vs supply side splits
 */
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const totalSteth = await getTotalSteth(options);

  // get total staking fees earned
  let totalStakeFees = BigInt(0);
  const protocolFeesLog = await options.getLogs({
    target: LIQUIDITY_POOL,
    eventAbi: "event ProtocolFeePaid(uint128 protocolFees)",
  });

  for (const log of protocolFeesLog) {
    totalStakeFees += log.protocolFees;
  }
  const stethFees = await getStethFees(options, totalSteth);
  const stethRevenue = totalSteth * 3.5 / 100 * 0.025 / 365

  // Eigenlayer restaking rewards claimed weekly on Optimism L2
  const optimismApi = new sdk.ChainApi({ chain: 'optimism', timestamp: options.toTimestamp });
  const restakingRewardsEigen = BigInt(await optimismApi.call({
    target: '0xAB7590CeE3Ef1A863E9A5877fBB82D9bE11504da',
    abi: 'function categoryTVL(string _category) view returns (uint256)',
    params: [EIGEN]
  }));
  const eigenFeesTotal = restakingRewardsEigen / BigInt(7); // Convert weekly to daily
  const eigenRevenueShare = restakingRewardsEigen / BigInt(7 * 90) * BigInt(10); // ~11% protocol share
  dailyFees.add(EIGEN, eigenFeesTotal, MetricLabels.EIGEN_STAKING_REWARDS);
  dailyRevenue.add(EIGEN, eigenRevenueShare, MetricLabels.EIGEN_STAKING_REWARDS);
  dailySupplySideRevenue.add(EIGEN, eigenFeesTotal - eigenRevenueShare, MetricLabels.EIGEN_STAKING_REWARDS);

  // SSV token rewards for running SSV-based validators
  const ssvRevenue = await getSsvRevenue(options);
  dailyFees.add(SSV, ssvRevenue, MetricLabels.SSV_STAKING_REWARDS);
  dailyRevenue.add(SSV, ssvRevenue, MetricLabels.SSV_STAKING_REWARDS);

  // OBOL token rewards for running OBOL-based validators
  const obolRevenue = await getObolRevenue(options);
  dailyFees.add(OBOL, obolRevenue, MetricLabels.OBOL_STAKING_REWARDS);
  dailyRevenue.add(OBOL, obolRevenue, MetricLabels.OBOL_STAKING_REWARDS);

  // add withdrawal fees
  const withdrawalFees = await getWithdrawalFees(options);
  dailyFees.add(EETH, withdrawalFees, MetricLabels.WITHDRAW_FEES);
  dailyRevenue.add(EETH, withdrawalFees, MetricLabels.WITHDRAW_FEES);

  const { wethRevenue, eigenRevenue } = await getMiscStakingRevenue(options);
  dailyRevenue.add(EETH, wethRevenue, MetricLabels.EIGEN_STAKING_REWARDS);
  dailyFees.add(EETH, wethRevenue, MetricLabels.EIGEN_STAKING_REWARDS);
  dailyRevenue.add(EIGEN, eigenRevenue, MetricLabels.EIGEN_STAKING_REWARDS);
  dailyFees.add(EIGEN, eigenRevenue, MetricLabels.EIGEN_STAKING_REWARDS);

  const additionalRevenues = await getAdditionalRevenueStreams(options);

  // ether.fi buybacks (counted as holders revenue)
  const dailyHoldersRevenue = options.createBalances();
  if (additionalRevenues.buybacks > 0) {
    dailyHoldersRevenue.addUSDValue(additionalRevenues.buybacks, METRIC.TOKEN_BUY_BACK);
  }

  // stETH holding rewards from Lido rebasing (protocol keeps revenue portion, stakers get fees)
  dailyFees.add(STETH, stethFees + stethRevenue, MetricLabels.stETH_STAKING_REWARDS);
  dailyRevenue.add(STETH, stethRevenue, MetricLabels.stETH_STAKING_REWARDS); // Protocol share (2.5%)
  dailySupplySideRevenue.add(STETH, stethFees, MetricLabels.stETH_STAKING_REWARDS); // Staker share (rebasing rewards)

  // Core staking protocol fees from eETH staking operations
  dailyRevenue.add(EETH, totalStakeFees, MetricLabels.ETH_STAKING_REWARDS);
  dailyFees.add(EETH, totalStakeFees * BigInt(10), MetricLabels.ETH_STAKING_REWARDS); // 10x for total staking rewards
  dailySupplySideRevenue.add(EETH, totalStakeFees * BigInt(9), MetricLabels.ETH_STAKING_REWARDS); // ~90% to stakers

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ETHEREUM],
  dependencies: [Dependencies.DUNE],
  start: '2024-03-13',
  methodology: {
    Fees: "Total rewards generated from ether.fi staking services: ETH staking, Eigenlayer restaking, validator operations",
    Revenue: "Protocol's share of fees including management fees from staking/restaking and validator operations rewards",
    ProtocolRevenue: "Same as Revenue - all protocol earnings retained by ether.fi.",
    SupplySideRevenue: "Portion of fees distributed to stakers.",
    HoldersRevenue: "Token buybacks executed by ether.fi benefiting ETHFI token holders.",
  },
  breakdownMethodology: {
    Fees: {
      [MetricLabels.ETH_STAKING_REWARDS]: 'All rewards from core ETH staking, derived from the protocol fees paid by the liquidity pool (protocol fee represents ~10% of total staking rewards).',
      [MetricLabels.EIGEN_STAKING_REWARDS]: 'EigenLayer restaking rewards claimed weekly on Optimism (converted to daily), plus miscellaneous WETH/EIGEN transfers to the protocol treasury.',
      [MetricLabels.stETH_STAKING_REWARDS]: 'Lido rebasing rewards accrued on the stETH/wstETH held by the EtherFiRestaker contract.',
      [MetricLabels.SSV_STAKING_REWARDS]: 'SSV token rewards earned for running SSV-based validators.',
      [MetricLabels.OBOL_STAKING_REWARDS]: 'OBOL token rewards earned for running Obol-based validators.',
      [MetricLabels.WITHDRAW_FEES]: 'Fees charged on eETH withdrawals, tracked as eETH transfers from the withdrawal queue to the treasury.',
    },
    Revenue: {
      [MetricLabels.ETH_STAKING_REWARDS]: 'Protocol keeps ~10% of core ETH staking rewards.',
      [MetricLabels.EIGEN_STAKING_REWARDS]: 'Protocol keeps ~11% of EigenLayer restaking rewards, plus all miscellaneous treasury transfers.',
      [MetricLabels.stETH_STAKING_REWARDS]: 'Protocol keeps a 2.5% share of the stETH staking rewards.',
      [MetricLabels.SSV_STAKING_REWARDS]: 'SSV validator rewards are retained by the protocol.',
      [MetricLabels.OBOL_STAKING_REWARDS]: 'OBOL validator rewards are retained by the protocol.',
      [MetricLabels.WITHDRAW_FEES]: 'eETH withdrawal fees are retained by the protocol.',
    },
    SupplySideRevenue: {
      [MetricLabels.ETH_STAKING_REWARDS]: 'The ~90% of core ETH staking rewards distributed to stakers.',
      [MetricLabels.EIGEN_STAKING_REWARDS]: 'The ~89% of EigenLayer restaking rewards distributed to stakers.',
      [MetricLabels.stETH_STAKING_REWARDS]: 'stETH rebasing rewards passed on to stakers (everything above the 2.5% protocol share).',
    },
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: 'ETHFI token buybacks executed by ether.fi from protocol revenue',
    },
  }
};

export default adapter;
