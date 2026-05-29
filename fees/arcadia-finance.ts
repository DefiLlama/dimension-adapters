import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import ADDRESSES from '../helpers/coreAssets.json';

type ChainConfig = {
  lendingPools: { address: string, underlying: string }[];
  assetManagers: string[];
};

const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.BASE]: {
    lendingPools: [
      { 
        address: "0x803ea69c7e87D1d6C86adeB40CB636cC0E6B98E2", 
        underlying: ADDRESSES.base.WETH 
      },
      { 
        address: "0x3ec4a293Fb906DD2Cd440c20dECB250DeF141dF1", 
        underlying: ADDRESSES.base.USDC 
      },
      { 
        address: "0xa37e9b4369dc20940009030bfbc2088f09645e3b", 
        underlying: ADDRESSES.base.cbBTC 
      },
    ],
    assetManagers: [
      "0x467837f44A71e3eAB90AEcfC995c84DC6B3cfCF7", // CompounderSlipstreamV1
      "0x35e59448C7145482E56212510cC689612AB4F61f", // CompounderSlipstreamV2
      "0xd42A3Ac56456bD5422835B36C35Cacb6448ddCd9", // CompounderSlipstreamV3
      "0x02e1fa043214E51eDf1F0478c6D0d3D5658a2DC3", // CompounderUniswapV3
      "0xAA95c9c402b195D8690eCaea2341a76e3266B189", // CompounderUniswapV4
      "0x5802454749cc0c4A6F28D5001B4cD84432e2b79F", // RebalancerSlipstreamV1
      "0x953Ff365d0b562ceC658dc46B394E9282338d9Ea", // RebalancerSlipstreamV2
      "0x37c6258aEe125d520B6f03fc2cb490955050D557", // RebalancerSlipstreamV3
      "0xbA1D0c99c261F94b9C8b52465890Cca27dd993Bd", // RebalancerUniswapV3
      "0x01EDaF0067a10D18c88D2876c0A85Ee0096a5Ac0", // RebalancerUniswapV4
      "0x5a8278D37b7a787574b6Aa7E18d8C02D994f18Ba", // YieldClaimerSlipstreamV1
      "0xc8bF4B2c740FF665864E9494832520f18822871C", // YieldClaimerSlipstreamV2
      "0x8c1Fbf38118fD5A704b6E7babcB7AF1a9A291980", // YieldClaimerSlipstreamV3
      "0x75Ed28EA8601Ce9F5FbcAB1c2428f04A57aFaA16", // YieldClaimerUniswapV3
      "0xD8aa21AB7f9B8601CB7d7A776D3AFA1602d5D8D4", // YieldClaimerUniswapV4
      "0xc928013A219EC9F18dE7B2dee6A50Ba626811854", // CoW Swapper
    ],
  },
  [CHAIN.OPTIMISM]: {
    lendingPools: [
      { 
        address: "0x803ea69c7e87D1d6C86adeB40CB636cC0E6B98E2", 
        underlying: ADDRESSES.optimism.WETH 
      },
      { 
        address: "0x3ec4a293Fb906DD2Cd440c20dECB250DeF141dF1", 
        underlying: ADDRESSES.optimism.USDC 
      },
    ],
    assetManagers: [
      "0x467837f44A71e3eAB90AEcfC995c84DC6B3cfCF7", // CompounderSlipstreamV1
      "0x02e1fa043214E51eDf1F0478c6D0d3D5658a2DC3", // CompounderUniswapV3
      "0xAA95c9c402b195D8690eCaea2341a76e3266B189", // CompounderUniswapV4
      "0x5802454749cc0c4A6F28D5001B4cD84432e2b79F", // RebalancerSlipstreamV1
      "0xbA1D0c99c261F94b9C8b52465890Cca27dd993Bd", // RebalancerUniswapV3
      "0x01EDaF0067a10D18c88D2876c0A85Ee0096a5Ac0", // RebalancerUniswapV4
      "0x5a8278D37b7a787574b6Aa7E18d8C02D994f18Ba", // YieldClaimerSlipstreamV1
      "0x75Ed28EA8601Ce9F5FbcAB1c2428f04A57aFaA16", // YieldClaimerUniswapV3
      "0xD8aa21AB7f9B8601CB7d7A776D3AFA1602d5D8D4", // YieldClaimerUniswapV4
    ],
  },
  [CHAIN.UNICHAIN]: {
    lendingPools: [
      {
        address: "0x803ea69c7e87D1d6C86adeB40CB636cC0E6B98E2", 
        underlying: ADDRESSES.unichain.WETH 
      },
      { address: "0x3ec4a293Fb906DD2Cd440c20dECB250DeF141dF1", 
        underlying: ADDRESSES.unichain.USDC 
      },
    ],
    assetManagers: [
      "0x467837f44A71e3eAB90AEcfC995c84DC6B3cfCF7", // CompounderSlipstreamV1
      "0x02e1fa043214E51eDf1F0478c6D0d3D5658a2DC3", // CompounderUniswapV3
      "0xAA95c9c402b195D8690eCaea2341a76e3266B189", // CompounderUniswapV4
      "0x5802454749cc0c4A6F28D5001B4cD84432e2b79F", // RebalancerSlipstreamV1
      "0xbA1D0c99c261F94b9C8b52465890Cca27dd993Bd", // RebalancerUniswapV3
      "0x01EDaF0067a10D18c88D2876c0A85Ee0096a5Ac0", // RebalancerUniswapV4
      "0x5a8278D37b7a787574b6Aa7E18d8C02D994f18Ba", // YieldClaimerSlipstreamV1
      "0x75Ed28EA8601Ce9F5FbcAB1c2428f04A57aFaA16", // YieldClaimerUniswapV3
      "0xD8aa21AB7f9B8601CB7d7A776D3AFA1602d5D8D4", // YieldClaimerUniswapV4
    ],
  },
};

const STAKED_RECOVERY_TOKEN = "0x3889255C5a9A55137DfdF870a0C30A285978176A";

const REDEEM_EVENT = "event Redeemed(address indexed user, uint256 amount)";
const INTEREST_SYNCED_EVENT = "event InterestSynced(uint256 interest)";
const BORROW_EVENT = "event Borrow(address indexed account, address indexed by, address to, uint256 amount, uint256 fee, bytes3 indexed referrer)";
const AUCTION_FINISHED_EVENT = "event AuctionFinished(address indexed account, address indexed creditor, uint256 startDebt, uint256 initiationReward, uint256 terminationReward, uint256 penalty, uint256 badDebt, uint256 surplus)";
const FEE_PAID_EVENT = "event FeePaid(address indexed account, address indexed receiver, address indexed asset, uint256 amount)";

const fetch = async (options: FetchOptions) => {
  const config = chainConfig[options.chain];

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  for (const pool of config.lendingPools) {
    const interestSyncLogs = await options.getLogs({
      target: pool.address,
      eventAbi: INTEREST_SYNCED_EVENT,
    });

    for (const interestSync of interestSyncLogs) {
      // 15% treasury share
      const treasuryShare = interestSync.interest * 15n / 100n;
      const lpShare = interestSync.interest - treasuryShare;
      dailyFees.add(pool.underlying, interestSync.interest, METRIC.BORROW_INTEREST);
      dailyRevenue.add(pool.underlying, treasuryShare, METRIC.BORROW_INTEREST);
      dailySupplySideRevenue.add(pool.underlying, lpShare, METRIC.BORROW_INTEREST);
    };

    const borrowLogs = await options.getLogs({
      target: pool.address,
      eventAbi: BORROW_EVENT,
    });

    for (const borrow of borrowLogs) {
      dailyFees.add(pool.underlying, borrow.fee, "Origination Fees");
      dailyRevenue.add(pool.underlying, borrow.fee, "Origination Fees");
    };

    const liquidationLogs = await options.getLogs({
      target: pool.address,
      eventAbi: AUCTION_FINISHED_EVENT,
    });

    for (const liquidation of liquidationLogs) {
      // 50% of penalty goes to treasury
      const treasuryShare = liquidation.penalty / 2n;
      const lpShare = liquidation.penalty - treasuryShare;
      const keeperReward = liquidation.initiationReward + liquidation.terminationReward;

      dailyFees.add(pool.underlying, liquidation.penalty, METRIC.LIQUIDATION_FEES);
      dailyFees.add(pool.underlying, keeperReward, "Keeper Rewards");

      dailyRevenue.add(pool.underlying, treasuryShare, METRIC.LIQUIDATION_FEES);
      dailySupplySideRevenue.add(pool.underlying, lpShare, METRIC.LIQUIDATION_FEES);
      dailySupplySideRevenue.add(pool.underlying, keeperReward, "Keeper Rewards");
    };
  };

  if (options.chain === CHAIN.BASE) {
    const redeemLogs = await options.getLogs({
      target: STAKED_RECOVERY_TOKEN,
      eventAbi: REDEEM_EVENT,
    });

    for (const redeemed of redeemLogs) {
      dailyHoldersRevenue.add(ADDRESSES.base.USDC, redeemed.amount, "Recovery Token Redemptions")
    };
  };

  const feePaidLogs = await options.getLogs({
    targets: config.assetManagers,
    eventAbi: FEE_PAID_EVENT,
    flatten: true
  });

  for (const feePaid of feePaidLogs) {
    dailyFees.add(feePaid.asset, feePaid.amount, METRIC.PERFORMANCE_FEES);
    dailyRevenue.add(feePaid.asset, feePaid.amount, METRIC.PERFORMANCE_FEES);
  };

  return { 
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue, 
    dailySupplySideRevenue, 
    dailyProtocolRevenue: dailyRevenue, 
    dailyHoldersRevenue 
  };
};

const methodology = {
  Fees: "Total fees paid, including borrow interest, origination fees, liquidation penalties, plus performance fees on auto-compounding, rebalancing, yield claiming and swap automation.",
  Revenue: "Treasury share of borrow interest and liquidations, plus full origination fees and asset manager performance fees.",
  SupplySideRevenue: "Lender share of borrow interest, plus liquidation penalties distributed to lending pool tranches and keeper bonuses paid to auction initiators/terminators.",
  ProtocolRevenue: "Gross protocol-side fees collected before ART (Recovery Token) holder rebates are paid out.",
  HoldersRevenue: "USDC rebates redeemed by ART (Recovery Token) holders. Funded from prior-epoch fee collections.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: "Interest paid by borrowers in Arcadia lending pools.",
    "Origination Fees": "Fees charged on the principal of new borrows.",
    [METRIC.LIQUIDATION_FEES]: "Liquidation penalties paid by liquidated account owners.",
    "Keeper Rewards": "Initiator and terminator rewards paid to keepers that trigger and finish liquidation auctions.",
    [METRIC.PERFORMANCE_FEES]: "Fees charged on claimed yield and rebalance swaps.",
  },
  Revenue: {
    [METRIC.BORROW_INTEREST]: "Share of borrow interest routed to the treasury.",
    "Origination Fees": "Full origination fee routed to the treasury.",
    [METRIC.LIQUIDATION_FEES]: "Share of liquidation penalties routed to the treasury.",
    [METRIC.PERFORMANCE_FEES]: "Fees charged on claimed yield and rebalance swaps.",
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: "Share of borrow interest distributed across lending pool tranches.",
    [METRIC.LIQUIDATION_FEES]: "Share of liquidation penalty distributed to the most junior tranche.",
    "Keeper Rewards": "Initiator and terminator rewards paid to keepers running liquidation auctions.",
  },
  ProtocolRevenue: {
    [METRIC.BORROW_INTEREST]: "Share of borrow interest routed to the treasury.",
    "Origination Fees": "Full origination fee routed to the treasury.",
    [METRIC.LIQUIDATION_FEES]: "Share of liquidation penalties routed to the treasury.",
    [METRIC.PERFORMANCE_FEES]: "Fees charged on claimed yield and rebalance swaps.",
  },
  HoldersRevenue: {
    "Recovery Token Redemptions": "USDC paid out when ART holders redeem accumulated rebates.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  pullHourly: true,
  adapter: {
    [CHAIN.BASE]: {
      start: "2024-03-19"
    },
    [CHAIN.OPTIMISM]: {
      start: "2026-02-26"
    },
    [CHAIN.UNICHAIN]: {
      start: "2025-11-28"
    }
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
