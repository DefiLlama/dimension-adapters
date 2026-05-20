import ADDRESSES from "../../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const inflatedFees = [1712275200] // 2024-04-05, Inflated fees (22M fees for 48M volume)

const chainConfig: Record<string, { start: string; fetch: typeof fetch; feeWallet: string; rewardWallet: string }> = {
  [CHAIN.SOLANA]: {
    start: "2023-08-23",
    fetch,
    feeWallet: "ZG98FUCjb8mJ824Gbs6RsgVmr1FhXb2oNiJHa2dwmPd",
    rewardWallet: "84DGj4Qpypcaa5uxdzphYzkutEUTvxLWSuWq3BoJLxkp",
  },
};

const LABELS = {
  BOT_FEES: "BonkBot trading fees",
  BOT_REVENUE: "BonkBot trading fees excluding referral rewards",
  REFERRAL_REWARDS: "Referral rewards",
};

async function fetch(_a: any, _b: any, options: FetchOptions) {
  const { feeWallet, rewardWallet } = chainConfig[options.chain];
  const query = `
    WITH botTrades AS (
      SELECT
        block_time,
        amount_usd,
        fee_usd
      FROM
        bonkbot_solana.bot_trades
      WHERE
        blockchain = 'solana'
        AND is_last_trade_in_transaction = true
        AND TIME_RANGE
    ),
    rewardTransfers AS (
      SELECT
        tx_id,
        MAX(block_time) AS block_time,
        SUM(CASE WHEN address = '${rewardWallet}' AND balance_change > 0 THEN balance_change ELSE 0 END) AS reward_lamports
      FROM solana.account_activity
      WHERE block_date BETWEEN date(from_unixtime(${options.startTimestamp})) AND date(from_unixtime(${options.endTimestamp}))
        AND block_time >= from_unixtime(${options.startTimestamp})
        AND block_time < from_unixtime(${options.endTimestamp})
        AND token_mint_address IS NULL
        AND address IN ('${feeWallet}', '${rewardWallet}')
      GROUP BY 1
      HAVING
        SUM(CASE WHEN address = '${feeWallet}' AND balance_change < 0 THEN 1 ELSE 0 END) > 0
        AND SUM(CASE WHEN address = '${rewardWallet}' AND balance_change > 0 THEN 1 ELSE 0 END) > 0
    ),
    referralRewards AS (
      SELECT
        CAST(COALESCE(SUM(reward_lamports), 0) AS VARCHAR) AS referralRewards
      FROM
        rewardTransfers
    )
    SELECT
      COALESCE((SELECT SUM(fee_usd) FROM botTrades), 0) AS dailyFees,
      (SELECT referralRewards FROM referralRewards) AS referralRewards
  `;

  const data = await queryDuneSql(options, query);
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  if (!inflatedFees.includes(options.startOfDay)){
    const fees = Number(data[0].dailyFees);
    const referralRewards = data[0].referralRewards;

    dailyFees.addUSDValue(fees, LABELS.BOT_FEES);
    dailyRevenue.addUSDValue(fees, LABELS.BOT_REVENUE);
    dailySupplySideRevenue.add(ADDRESSES.solana.SOL, referralRewards, LABELS.REFERRAL_REWARDS);
    dailyRevenue.subtract(dailySupplySideRevenue, LABELS.BOT_REVENUE);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}


const adapter: SimpleAdapter = {
  version: 1,
  adapter: chainConfig,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  allowNegativeValue: true,
  methodology: {
    Fees: "All trading fees paid by users while using bot.",
    Revenue: "Trading fees kept by Bonk Bot after referral rewards paid from the fee wallet to the reward wallet.",
    ProtocolRevenue: "Trading fees kept by Bonk Bot after referral rewards paid from the fee wallet to the reward wallet.",
    SupplySideRevenue: "Referral rewards funded from the Bonk Bot fee wallet and sent to the reward wallet.",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.BOT_FEES]: "All trading fees paid by BonkBot users.",
    },
    Revenue: {
      [LABELS.BOT_REVENUE]: "Trading fees retained by Bonk Bot after referral rewards.",
    },
    ProtocolRevenue: {
      [LABELS.BOT_REVENUE]: "Trading fees retained by Bonk Bot after referral rewards.",
    },
    SupplySideRevenue: {
      [LABELS.REFERRAL_REWARDS]: "SOL sent from the Bonk Bot fee wallet to the reward wallet for referral rewards.",
    },
  }
}

export default adapter;
