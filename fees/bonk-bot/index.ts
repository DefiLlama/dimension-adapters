import ADDRESSES from "../../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

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
        CAST(COALESCE(SUM(amount), 0) AS VARCHAR) AS referralRewards
      FROM tokens_solana.sol_transfers
      WHERE TIME_RANGE
        AND action = 'transfer'
        AND from_owner = '${feeWallet}'
        AND to_owner = '${rewardWallet}'
    )
    SELECT
      COALESCE((SELECT SUM(fee_usd) FROM botTrades), 0) AS dailyFees,
      (SELECT referralRewards FROM rewardTransfers) AS referralRewards
  `;

  const data = await queryDuneSql(options, query);
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  if (!inflatedFees.includes(options.startOfDay)){
    const fees = Number(data[0].dailyFees);
    const referralRewards = data[0].referralRewards;

    dailyFees.addUSDValue(fees, METRIC.TRADING_FEES);
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
      [METRIC.TRADING_FEES]: "All trading fees paid by BonkBot users.",
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
