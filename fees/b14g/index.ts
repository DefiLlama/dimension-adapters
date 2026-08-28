import * as sdk from "@defillama/sdk";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryAllium } from "../../helpers/allium";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const DUAL_BTC_FEE_BPS = 1900n;
const BPS = 10000n;
const BABY_DECIMALS = 1e6;

const chainConfig = {
  [CHAIN.CORE]: {
    start: "2025-01-08",
    coreVault: "0xee21ab613d30330823D35Cf91A84cE964808B83F",
    dualBtcVault: "0x13E3eC65EFeB0A4583c852F4FaF6b2Fb31Ff04b1",
  },
  [CHAIN.BABYLON]: {
    start: "2026-01-29",
  },
};

const abi = {
  coreClaimReward: "event ClaimReward(uint256 reward, uint256 fee)",
  withdrawDirect: "event WithdrawDirect(address indexed user, uint256 dualCoreAmount, uint256 coreAmount, uint256 fee)",
  claimMarketplaceReward: "event ClaimMarketplaceReward(uint256 reward)",
};

const addBabylonFees = async (options: FetchOptions, dailyFees: sdk.Balances, dailyRevenue: sdk.Balances, dailySupplySideRevenue: sdk.Balances) => {
  const start = new Date(options.startTimestamp * 1e3).toISOString();
  const end = new Date(options.endTimestamp * 1e3).toISOString();
  const [row] = await queryAllium(`
    WITH attrs AS (
      SELECT transaction_hash, event_index, key, value
      FROM babylon.raw.event_attributes
      WHERE TO_DATE(block_timestamp) BETWEEN '${start.slice(0, 10)}' AND '${end.slice(0, 10)}'
        AND block_timestamp > TO_TIMESTAMP_NTZ('${start}')
        AND block_timestamp <= TO_TIMESTAMP_NTZ('${end}')
        AND event_type = 'wasm-b14g-reward-receiver-wasm'
        AND key IN ('action_type', 'type', 'distribute_reward', 'take_fee')
    ), events AS (
      SELECT
        transaction_hash,
        event_index,
        MAX(CASE WHEN key = 'action_type' THEN value END) AS action_type,
        MAX(CASE WHEN key = 'type' THEN value END) AS reward_type,
        MAX(CASE WHEN key = 'distribute_reward' THEN value END) AS reward,
        MAX(CASE WHEN key = 'take_fee' THEN value END) AS fee
      FROM attrs
      GROUP BY transaction_hash, event_index
    )
    SELECT
      SUM(TRY_TO_NUMBER(REPLACE(reward, 'ubbn', ''))) AS rewards,
      SUM(TRY_TO_NUMBER(REPLACE(fee, 'ubbn', ''))) AS fees
    FROM events
    WHERE reward_type = 'distribute_reward'
      AND action_type IN ('BABYStaking', 'CoStaking')
  `);

  dailyFees.addCGToken("babylon", (Number(row?.rewards ?? 0) + Number(row?.fees ?? 0)) / BABY_DECIMALS, METRIC.STAKING_REWARDS);
  dailyRevenue.addCGToken("babylon", Number(row?.fees ?? 0) / BABY_DECIMALS, METRIC.PROTOCOL_FEES);
  dailySupplySideRevenue.addCGToken("babylon", Number(row?.rewards ?? 0) / BABY_DECIMALS, METRIC.STAKING_REWARDS);
};

const addCoreFees = async (options: FetchOptions, dailyFees: sdk.Balances, dailyRevenue: sdk.Balances, dailySupplySideRevenue: sdk.Balances) => {
  const { coreVault, dualBtcVault } = chainConfig[CHAIN.CORE];

  for (const log of await options.getLogs({ target: coreVault, eventAbi: abi.coreClaimReward })) {
    dailyFees.addGasToken(BigInt(log.reward) + BigInt(log.fee), METRIC.STAKING_REWARDS);
    dailyRevenue.addGasToken(log.fee, METRIC.PROTOCOL_FEES);
    dailySupplySideRevenue.addGasToken(log.reward, METRIC.STAKING_REWARDS);
  }

  for (const log of await options.getLogs({ target: coreVault, eventAbi: abi.withdrawDirect })) {
    dailyFees.addGasToken(log.fee, METRIC.DEPOSIT_WITHDRAW_FEES);
    dailyRevenue.addGasToken(log.fee, METRIC.DEPOSIT_WITHDRAW_FEES);
  }

  const marketplaceRewardLogs = await options.getLogs({ target: dualBtcVault, eventAbi: abi.claimMarketplaceReward });
  for (const log of marketplaceRewardLogs) {
    const reward = BigInt(log.reward);
    const revenue = reward * DUAL_BTC_FEE_BPS / BPS;
    dailyFees.addGasToken(reward, METRIC.STAKING_REWARDS);
    dailyRevenue.addGasToken(revenue, METRIC.PROTOCOL_FEES);
    dailySupplySideRevenue.addGasToken(reward - revenue, METRIC.STAKING_REWARDS);
  }
};

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  if (options.chain === CHAIN.BABYLON) {
    await addBabylonFees(options, dailyFees, dailyRevenue, dailySupplySideRevenue);
  } else {
    await addCoreFees(options, dailyFees, dailyRevenue, dailySupplySideRevenue);
  }
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  pullHourly: true,
  adapter: chainConfig,
  methodology: {
    Fees: "Gross yield earned by b14g Core products and Babylon rewards distributed to b14g.",
    Revenue: "Protocol cut of b14g Core product rewards, Babylon distributed rewards, and instant withdrawal fees.",
    ProtocolRevenue: "Protocol cut of b14g Core product rewards, Babylon distributed rewards, and instant withdrawal fees.",
    SupplySideRevenue: "Net yield distributed to BTC, CORE, and BABY stakers.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]: "Gross staking rewards earned by b14g Core products and Babylon BABYStaking/CoStaking rewards distributed to b14g orders.",
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "Instant withdrawal fees charged by the dualCORE vault.",
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: "Protocol fee charged on b14g Core product rewards and Babylon distributed rewards.",
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "Instant withdrawal fees charged by the dualCORE vault.",
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_FEES]: "Protocol fee charged on b14g Core product rewards and Babylon distributed rewards.",
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "Instant withdrawal fees charged by the dualCORE vault.",
    },
    SupplySideRevenue: {
      [METRIC.STAKING_REWARDS]: "Net staking rewards distributed to BTC, CORE, and BABY stakers; Babylon rewards are counted fully as supply-side rewards.",
    },
  },
  dependencies: [Dependencies.ALLIUM],
};

export default adapter;
