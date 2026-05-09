// https://etherfi.gitbook.io/etherfi
import * as sdk from "@defillama/sdk";
import { Adapter, Dependencies, FetchOptions, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ethers } from "ethers";
import ADDRESSES from "../../helpers/coreAssets.json";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

// Tokens
const EETH = ADDRESSES.ethereum.EETH;
const EIGEN = ADDRESSES.ethereum.EIGEN;
const STETH = ADDRESSES.ethereum.STETH;
const WSTETH = ADDRESSES.ethereum.WSTETH;
const SSV = "0x9D65fF81a3c488d585bBfb0Bfe3c7707c7917f54";
const OBOL = "0x0B010000b7624eb9B3DfBC279673C76E9D29D5F7";
const EETH_AS_WETH = "0x35fA164735182de50811E8e2E824cFb9B6118ac2";

// ether.fi contracts
const LIQUIDITY_POOL = "0x308861A430be4cce5502d0A12724771Fc6DaF216";
const TREASURY = "0x2f5301a3D59388c509C65f8698f521377D41Fd0F";
const VALIDATOR_REWARDS = "0x0c83EAe1FE72c390A02E426572854931EefF93BA";
const SSV_OPERATOR = "0xd1208cC82765aA4dc696117D26f37388B6Dcb6D5";
const SSV_FEE_RECIPIENT = "0x8fb66F38cF86A3d5e8768f8F1754A24A6c661Fb8";

// stETH/wstETH holders
const KARAK_WSTETH = "0xa3726beDFD1a8AA696b9B4581277240028c4314b";
const SYMBIOTIC_WSTETH = "0xC329400492c6ff2438472D4651Ad17389fCb843a";
const DEVAMP = "0x9FFDF407cDe9a93c47611799DA23924Af3EF764F";
const WEETHS = "0x917ceE801a67f933F2e6b33fC0cD1ED2d5909D88";
const WEETHK = "0x7223442cad8e9cA474fC40109ab981608F8c4273";
const WEETHK_HOLDER = "0xFdc479a18d06e2721d17024b549f3f6173a68805";

// EigenLayer rewards, claimed weekly on Optimism
const RESTAKING_CLAIM_OP = "0xAB7590CeE3Ef1A863E9A5877fBB82D9bE11504da";
const EIGEN_DAYS_PER_CLAIM = 7n;
const EIGEN_PROTOCOL_SHARE_BPS = 1000n;
const ETH_FEE_TO_TOTAL_REWARDS = 10n;

// ABIs

const BALANCE_OF_ABI = "function balanceOf(address) view returns (uint256)";
const GET_STETH_BY_WSTETH_ABI = "function getStETHByWstETH(uint256) view returns (uint256)";
const CATEGORY_TVL_ABI = "function categoryTVL(string _category) view returns (uint256)";

const TRANSFER_ABI = "event Transfer(address indexed from, address indexed to, uint256 value)";
const TOKEN_REBASED_ABI =
  "event TokenRebased(uint256 indexed reportTimestamp,uint256 timeElapsed,uint256 preTotalShares,uint256 preTotalEther,uint256 postTotalShares,uint256 postTotalEther,uint256 sharesMintedAsFees)";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const PROTOCOL_FEE_PAID_ABI = "event ProtocolFeePaid(uint128 protocolFees)";

const GWEI = 1_000_000_000n;
const DAYS_PER_YEAR = 365;
const ETH_STAKER_SHARE = 9n;

const LABELS = {
  stETH_STAKING_REWARDS: "stETH Staking Rewards",
  EIGEN_STAKING_REWARDS: "EigenLayer Staking Rewards",
  SSV_STAKING_REWARDS: "SSV Staking Rewards",
  OBOL_STAKING_REWARDS: "Obol Staking Rewards",
  ETH_STAKING_REWARDS: "Core ETH Staking Rewards",
};

const balanceOf = (options: FetchOptions, token: string, holder: string, permitFailure = false) =>
  options.api.call({
    target: token,
    abi: BALANCE_OF_ABI,
    params: [holder],
    permitFailure,
  });

const getTransferLogs = (options: FetchOptions, token: string, recipient: string) =>
  options.getLogs({
    target: token,
    eventAbi: TRANSFER_ABI,
    topics: [TRANSFER_TOPIC, null as any, ethers.zeroPadValue(recipient, 32)],
  });

const sumLogValues = (logs: any[]): bigint =>
  logs.reduce((acc: bigint, log: any) => acc + BigInt(log.value), 0n);

const getStethRebaseFees = async (options: FetchOptions, totalSteth: number): Promise<number> => {
  const logs = await options.getLogs({
    target: STETH,
    eventAbi: TOKEN_REBASED_ABI,
  });
  if (logs.length === 0) return 0;
  const latest = logs[logs.length - 1];
  const rateBefore = Number(latest.preTotalEther) / Number(latest.preTotalShares);
  const rateAfter = Number(latest.postTotalEther) / Number(latest.postTotalShares);
  const shares = totalSteth / rateBefore;
  return shares * rateAfter - shares * rateBefore;
};

const getTotalSteth = async (options: FetchOptions): Promise<number> => {
  const wstethRate: bigint = BigInt(
    await options.api.call({
      target: WSTETH,
      abi: GET_STETH_BY_WSTETH_ABI,
      params: [GWEI.toString()],
    }),
  );

  const holderBalances = await Promise.all(
    [DEVAMP, WEETHS, WEETHK].map(async (holder) => {
      const [steth, wsteth] = await Promise.all([
        balanceOf(options, STETH, holder),
        balanceOf(options, WSTETH, holder),
      ]);
      return BigInt(steth) + (BigInt(wsteth) * wstethRate) / GWEI;
    }),
  );

  const [restakedSymbiotic, restakedKarak] = await Promise.all([
    balanceOf(options, SYMBIOTIC_WSTETH, WEETHS, true),
    balanceOf(options, KARAK_WSTETH, WEETHK_HOLDER, true),
  ]);

  const restaked =
    ((BigInt(restakedSymbiotic ?? 0) + BigInt(restakedKarak ?? 0)) * wstethRate) / GWEI;

  return Number(holderBalances.reduce((a, b) => a + b, 0n) + restaked);
};

const getSsvRevenue = async (options: FetchOptions): Promise<bigint> => {
  const logs = await getTransferLogs(options, SSV, SSV_OPERATOR);
  // Transfers from the dedicated fee recipient are 100% protocol;
  // everything else has an 80% protocol cut (4/5 in integer math).
  return logs.reduce((acc: bigint, log: any) => {
    const value = BigInt(log.value);
    const fromFeeRecipient = log.from.toLowerCase() === SSV_FEE_RECIPIENT.toLowerCase();
    return acc + (fromFeeRecipient ? value : (value * 4n) / 5n);
  }, 0n);
};

const getObolRevenue = async (options: FetchOptions): Promise<bigint> =>
  sumLogValues(await getTransferLogs(options, OBOL, VALIDATOR_REWARDS));

const getMiscStakingRevenue = async (options: FetchOptions) => {
  const [wethLogs, eigenLogs] = await Promise.all([
    getTransferLogs(options, EETH_AS_WETH, VALIDATOR_REWARDS),
    getTransferLogs(options, EIGEN, VALIDATOR_REWARDS),
  ]);
  return { weth: sumLogValues(wethLogs), eigen: sumLogValues(eigenLogs) };
};

const getBuybacks = async (options: FetchOptions): Promise<number> => {
  const query = `
    select sum(amount_usd) as revenue_usd
    from (
        select amount_usd
        from dex_aggregator.trades
        where blockchain = 'ethereum'
          and taker = ${TREASURY}
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

  const rows = (await queryDuneSql(options, query)) ?? [];
  return rows[0]?.revenue_usd ?? 0;
};

/**
 * Etherfi-stake Revenue Stream Categories:
 *
 * STAKING_REWARDS: Consolidated category including:
 *   - Core ETH staking protocol fees (10% to protocol, 90% to stakers)
 *   - Eigenlayer restaking rewards from L2 claims (~11% to protocol, rest to stakers)
 *   - Restaking rewards from stETH holdings in restaker contracts (protocol only)
 *   - Lido stETH rebasing rewards (2.5% to protocol, rest to stakers)
 *   - SSV/OBOL rewards for running validators (protocol only)
 *   - Direct token transfers and miscellaneous earnings (protocol only)
 *
 * TOKEN_BUY_BACK: ETHFI buybacks benefiting token holders (holders revenue)
 *
 * Note: Different revenue streams have different protocol vs supply side splits
 */
const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const totalSteth = await getTotalSteth(options);

  // Core ETH staking, protocol takes 10%
  const protocolFeesLog = await options.getLogs({
    target: LIQUIDITY_POOL,
    eventAbi: PROTOCOL_FEE_PAID_ABI,
  });
  const totalStakeFees = protocolFeesLog.reduce((sum, log) => sum + log.protocolFees, 0n);

  // stETH rebase rewards (protocol cut = 2.5% of Lido's 3.5% APR estimate)
  const stethRebaseFees = await getStethRebaseFees(options, totalSteth);
  const stethRevenue = (totalSteth * 0.035 * 0.025) / DAYS_PER_YEAR;

  // EigenLayer rewards — claimed weekly on Optimism, ~11% to protocol
  const optimismApi = new sdk.ChainApi({ chain: "optimism", timestamp: options.toTimestamp });
  const restakingRewardsEigen = BigInt(
    await optimismApi.call({
      target: RESTAKING_CLAIM_OP,
      abi: CATEGORY_TVL_ABI,
      params: [EIGEN],
    }),
  );
  const eigenFeesTotal = restakingRewardsEigen / EIGEN_DAYS_PER_CLAIM;
  const eigenRevenueShare =
    (restakingRewardsEigen * EIGEN_PROTOCOL_SHARE_BPS) / (EIGEN_DAYS_PER_CLAIM * 10_000n);
  dailyFees.add(EIGEN, eigenFeesTotal, LABELS.EIGEN_STAKING_REWARDS);
  dailyRevenue.add(EIGEN, eigenRevenueShare, LABELS.EIGEN_STAKING_REWARDS);
  dailySupplySideRevenue.add(
    EIGEN,
    eigenFeesTotal - eigenRevenueShare,
    LABELS.EIGEN_STAKING_REWARDS,
  );

  // SSV / OBOL validator rewards
  const [ssvRevenue, obolRevenue] = await Promise.all([
    getSsvRevenue(options),
    getObolRevenue(options),
  ]);
  dailyFees.add(SSV, ssvRevenue, LABELS.SSV_STAKING_REWARDS);
  dailyRevenue.add(SSV, ssvRevenue, LABELS.SSV_STAKING_REWARDS);
  dailyFees.add(OBOL, obolRevenue, LABELS.OBOL_STAKING_REWARDS);
  dailyRevenue.add(OBOL, obolRevenue, LABELS.OBOL_STAKING_REWARDS);

  // Misc staking transfers (eETH-as-WETH and EIGEN to validator-rewards address)
  const misc = await getMiscStakingRevenue(options);
  dailyFees.add(EETH, misc.weth, LABELS.EIGEN_STAKING_REWARDS);
  dailyRevenue.add(EETH, misc.weth, LABELS.EIGEN_STAKING_REWARDS);
  dailyFees.add(EIGEN, misc.eigen, LABELS.EIGEN_STAKING_REWARDS);
  dailyRevenue.add(EIGEN, misc.eigen, LABELS.EIGEN_STAKING_REWARDS);

  // stETH restaking rewards estimate (3.5% APR × 3.8% protocol cut)
  const stethRestakingRewards = (totalSteth * 0.035 * 0.038) / DAYS_PER_YEAR;
  dailyFees.add(STETH, stethRestakingRewards, LABELS.EIGEN_STAKING_REWARDS);
  dailyRevenue.add(STETH, stethRestakingRewards, LABELS.EIGEN_STAKING_REWARDS);

  // ETHFI buybacks (counted as holders revenue)
  const buybacks = await getBuybacks(options);
  if (buybacks >0) dailyHoldersRevenue.addUSDValue(buybacks, METRIC.TOKEN_BUY_BACK);

  // stETH holding rewards from Lido rebasing
  dailyFees.add(STETH, stethRebaseFees + stethRevenue, LABELS.stETH_STAKING_REWARDS);
  dailyRevenue.add(STETH, stethRevenue, LABELS.stETH_STAKING_REWARDS);
  dailySupplySideRevenue.add(STETH, stethRebaseFees, LABELS.stETH_STAKING_REWARDS);

  // Core staking protocol fees from eETH staking operations
  dailyRevenue.add(EETH, totalStakeFees, LABELS.ETH_STAKING_REWARDS);
  dailyFees.add(EETH, totalStakeFees * ETH_FEE_TO_TOTAL_REWARDS, LABELS.ETH_STAKING_REWARDS);
  dailySupplySideRevenue.add(EETH, totalStakeFees * ETH_STAKER_SHARE, LABELS.ETH_STAKING_REWARDS);

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
    SupplySideRevenue: "Portion of fees distributed to stakers.",
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
    Revenue: {
      [LABELS.ETH_STAKING_REWARDS]: "Protocol share of core ETH staking rewards.",
      [LABELS.EIGEN_STAKING_REWARDS]: "Protocol share of EigenLayer staking & restaking.",
      [LABELS.stETH_STAKING_REWARDS]: "Protocol share of stETH holding rewards.",
      [LABELS.SSV_STAKING_REWARDS]: "Protocol share of SSV network staking.",
      [LABELS.OBOL_STAKING_REWARDS]: "Protocol share of Obol network staking.",
    },
    SupplySideRevenue: {
      [LABELS.ETH_STAKING_REWARDS]: "Staker share of core ETH staking rewards.",
      [LABELS.EIGEN_STAKING_REWARDS]: "Staker share of EigenLayer staking & restaking.",
      [LABELS.stETH_STAKING_REWARDS]: "Staker share of stETH holding rewards.",
    },
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: "ETHFI token buybacks executed by ether.fi.",
    },
  },
};

export default adapter;
