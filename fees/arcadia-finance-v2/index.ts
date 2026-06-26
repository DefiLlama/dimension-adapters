import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import ADDRESSES from "../../helpers/coreAssets.json";
import PromisePool from "@supercharge/promise-pool";

type ChainConfig = {
  lendingPools: { address: string, underlying: string }[];
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
  },
};

// Asset managers emit `FeePaid` on automated actions (compounding, rebalancing,
// yield claiming, swaps). Addresses are deployed deterministically across chains,
// so a single superset is used everywhere; addresses inactive on a given chain
// simply return no logs.
const ASSET_MANAGERS = [
  // --- V2.0.1 ---
  "0x4694c34d153EE777CC07d01AC433bcC010A20EBd", // Compounder Slipstream
  "0x80D3548bc54710d46201D554712E8638fD51326D", // Compounder Uniswap V3
  "0xCfF15E24a453aFAd454533E6D10889A84e2A68e1", // Compounder Uniswap V4
  "0xEfe600366e9847D405f2238cF9196E33780B3A42", // Rebalancer Slipstream
  "0xD8285fC23eFF687B8b618b78d85052f1eD17236E", // Rebalancer Uniswap V3
  "0xa8676C8c197E12a71AE82a08B02DD9e666312cF1", // Rebalancer Uniswap V4
  "0x1f75aBF8a24782053B351D9b4EA6d1236ED59105", // Yield Claimer Slipstream
  "0x40462e71Effd9974Fee04B6b327B701D663f753e", // Yield Claimer Uniswap V3
  "0x3BC2B398eEEE9807ff76fdb4E11526dE0Ee80cEa", // Yield Claimer Uniswap V4

  // --- V2.1.0 ---
  "0x467837f44A71e3eAB90AEcfC995c84DC6B3cfCF7", // Compounder Slipstream V1
  "0x35e59448C7145482E56212510cC689612AB4F61f", // Compounder Slipstream V2
  "0xd42A3Ac56456bD5422835B36C35Cacb6448ddCd9", // Compounder Slipstream V3
  "0x3e7b6997399eC402491c4A049e4CD727d3aA1738", // Compounder Slipstream V3 (OP)
  "0x02e1fa043214E51eDf1F0478c6D0d3D5658a2DC3", // Compounder Uniswap V3
  "0xAA95c9c402b195D8690eCaea2341a76e3266B189", // Compounder Uniswap V4
  "0xE07A9383AF8E0B1320419dFeF205bb9bA75f3Ef2", // Rebalancer Slipstream V1
  "0xc0dBb5443689E40E4b58b627F82f468Ef1Ad7561", // Rebalancer Slipstream V2
  "0xbb22cdbfFF5a263E85917803692db3630bF860c4", // Rebalancer Uniswap V3
  "0x9E466179c46eB098B564cbE319bA4b3EAd6476C1", // Rebalancer Uniswap V4
  "0x5a8278D37b7a787574b6Aa7E18d8C02D994f18Ba", // Yield Claimer Slipstream V1
  "0xc8bF4B2c740FF665864E9494832520f18822871C", // Yield Claimer Slipstream V2
  "0x8c1Fbf38118fD5A704b6E7babcB7AF1a9A291980", // Yield Claimer Slipstream V3
  "0x3630bdB1AC7cF8a435411391db75450350814F42", // Yield Claimer Slipstream V3 (OP)
  "0x75Ed28EA8601Ce9F5FbcAB1c2428f04A57aFaA16", // Yield Claimer Uniswap V3
  "0xD8aa21AB7f9B8601CB7d7A776D3AFA1602d5D8D4", // Yield Claimer Uniswap V4
  "0x969F0251360b9Cf11c68f6Ce9587924c1B8b42C6", // Merkl Operator (shared)
  "0x4aa34F76F85F72A0F0B6Df7aE109F94Da0575d5F", // Merkl Operator (Base)

  // --- V2.1.1 ---
  "0x5802454749cc0c4A6F28D5001B4cD84432e2b79F", // Rebalancer Slipstream V1
  "0x953Ff365d0b562ceC658dc46B394E9282338d9Ea", // Rebalancer Slipstream V2
  "0x37c6258aEe125d520B6f03fc2cb490955050D557", // Rebalancer Slipstream V3
  "0x33442FC10A20Aad0dDd73F6aE24500f5B370dc51", // Rebalancer Slipstream V3 (OP)
  "0xbA1D0c99c261F94b9C8b52465890Cca27dd993Bd", // Rebalancer Uniswap V3
  "0x01EDaF0067a10D18c88D2876c0A85Ee0096a5Ac0", // Rebalancer Uniswap V4

  // --- CoW Swappers ---
  "0xc928013A219EC9F18dE7B2dee6A50Ba626811854", // CoW Swapper V1
  "0xFfC742E68D41389BE9Ef1aFD518F036064DA2Bb6", // CoW Swapper V1.1
];

// ActionTarget used by manual (non-automated) front-end account actions. It emits
// `FeesPaid` (distinct event/signature from the asset managers' `FeePaid`).
const ACTION_TARGET = "0xa48D4201030C09CEA82f5B0955b9C837699D3c32";

// https://docs.arcadia.finance/protocol/fees
const INTEREST_TREASURY_SHARE = 15n; // 15%
const LIQUIDATION_PENALTY_TREASURY_SHARE = 50n; // 50%

const STAKED_RECOVERY_TOKEN = "0x3889255C5a9A55137DfdF870a0C30A285978176A";

const REDEEM_EVENT = "event Redeemed(address indexed user, uint256 amount)";
const INTEREST_SYNCED_EVENT = "event InterestSynced(uint256 interest)";
const BORROW_EVENT = "event Borrow(address indexed account, address indexed by, address to, uint256 amount, uint256 fee, bytes3 indexed referrer)";
const AUCTION_FINISHED_EVENT = "event AuctionFinished(address indexed account, address indexed creditor, uint256 startDebt, uint256 initiationReward, uint256 terminationReward, uint256 penalty, uint256 badDebt, uint256 surplus)";
const FEE_PAID_EVENT = "event FeePaid(address indexed account, address indexed receiver, address indexed asset, uint256 amount)";
const FEES_PAID_EVENT = "event FeesPaid(address indexed account, address indexed asset, address indexed feeRecipient, uint256 amount)";

const fetch = async (options: FetchOptions) => {
  const config = chainConfig[options.chain];

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const tasks = config.lendingPools.flatMap(pool => [
    { pool, type: "interest", event: INTEREST_SYNCED_EVENT },
    { pool, type: "borrow", event: BORROW_EVENT },
    { pool, type: "liquidation", event: AUCTION_FINISHED_EVENT },
  ]);

  const { errors } = await PromisePool
    .withConcurrency(3)
    .for(tasks)
    .process(async ({ pool, type, event }) => {
      const logs = await options.getLogs({ target: pool.address, eventAbi: event });
      if (type === "interest") {
        for (const interestSync of logs) {
          const treasuryShare = interestSync.interest * INTEREST_TREASURY_SHARE / 100n;
          const lpShare = interestSync.interest - treasuryShare;
          dailyFees.add(pool.underlying, interestSync.interest, METRIC.BORROW_INTEREST);
          dailyRevenue.add(pool.underlying, treasuryShare, METRIC.BORROW_INTEREST);
          dailySupplySideRevenue.add(pool.underlying, lpShare, METRIC.BORROW_INTEREST);
        };
      };

      if (type === "borrow") {
        for (const borrow of logs) {
          dailyFees.add(pool.underlying, borrow.fee, "Origination Fees");
          dailyRevenue.add(pool.underlying, borrow.fee, "Origination Fees");
        };
      };

      if (type === "liquidation") {
        for (const liquidation of logs) {
          const treasuryShare = liquidation.penalty * LIQUIDATION_PENALTY_TREASURY_SHARE / 100n;
          const lpShare = liquidation.penalty - treasuryShare;
          const keeperReward = liquidation.initiationReward + liquidation.terminationReward;

          dailyFees.add(pool.underlying, liquidation.penalty, METRIC.LIQUIDATION_FEES);
          dailyFees.add(pool.underlying, keeperReward, "Keeper Rewards");

          dailyRevenue.add(pool.underlying, treasuryShare, METRIC.LIQUIDATION_FEES);
          dailySupplySideRevenue.add(pool.underlying, lpShare, METRIC.LIQUIDATION_FEES);
          dailySupplySideRevenue.add(pool.underlying, keeperReward, "Keeper Rewards");
        };
      };
    });

  if (errors.length > 0) {
    throw errors[0];
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

  // Automated asset-manager fees (compounding, rebalancing, yield claiming, swaps).
  const feePaidLogs = await options.getLogs({
    targets: ASSET_MANAGERS,
    eventAbi: FEE_PAID_EVENT,
    flatten: true
  });

  for (const feePaid of feePaidLogs) {
    dailyFees.add(feePaid.asset, feePaid.amount, METRIC.PERFORMANCE_FEES);
    dailyRevenue.add(feePaid.asset, feePaid.amount, METRIC.PERFORMANCE_FEES);
  };

  // Manual (non-automated) front-end action fees collected by the ActionTarget.
  const feesPaidLogs = await options.getLogs({
    target: ACTION_TARGET,
    eventAbi: FEES_PAID_EVENT,
  });

  for (const feesPaid of feesPaidLogs) {
    dailyFees.add(feesPaid.asset, feesPaid.amount, METRIC.PERFORMANCE_FEES);
    dailyRevenue.add(feesPaid.asset, feesPaid.amount, METRIC.PERFORMANCE_FEES);
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
  Fees: "Total fees paid, including borrow interest, origination fees, liquidation penalties, plus performance fees (a percentage of earned yield) charged on automated actions and manual front-end actions.",
  UserFees: "Total fees paid, including borrow interest, origination fees, liquidation penalties, plus performance fees (a percentage of earned yield) charged on automated actions and manual front-end actions.",
  Revenue: "Treasury share of borrow interest and liquidations, plus full origination fees and performance fees (a percentage of earned yield) from automated and manual front-end actions.",
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
    [METRIC.PERFORMANCE_FEES]: "Percentage of earned yield taken on both automated actions (compounding, rebalancing, yield claiming, swaps) and manual front-end actions.",
  },
  UserFees: {
    [METRIC.BORROW_INTEREST]: "Interest paid by borrowers in Arcadia lending pools.",
    "Origination Fees": "Fees charged on the principal of new borrows.",
    [METRIC.LIQUIDATION_FEES]: "Liquidation penalties paid by liquidated account owners.",
    "Keeper Rewards": "Initiator and terminator rewards paid to keepers that trigger and finish liquidation auctions.",
    [METRIC.PERFORMANCE_FEES]: "Percentage of earned yield taken on both automated actions (compounding, rebalancing, yield claiming, swaps) and manual front-end actions.",
  },
  Revenue: {
    [METRIC.BORROW_INTEREST]: "Share of borrow interest routed to the treasury.",
    "Origination Fees": "Full origination fee routed to the treasury.",
    [METRIC.LIQUIDATION_FEES]: "Share of liquidation penalties routed to the treasury.",
    [METRIC.PERFORMANCE_FEES]: "Percentage of earned yield taken on both automated actions (compounding, rebalancing, yield claiming, swaps) and manual front-end actions.",
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
    [METRIC.PERFORMANCE_FEES]: "Percentage of earned yield taken on both automated actions (compounding, rebalancing, yield claiming, swaps) and manual front-end actions.",
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
