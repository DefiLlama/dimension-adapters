import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

const LEVERAGE_FEE_WALLET = "8iMq4uShCbj4HAGKrHHd9EY4SmYor2y1XRP7Fh21BwHJ";
const SPOT_FEE_WALLET = "3JtcndcJ7EePpfYh6Hhs17qXNoeq2b9MCgidcreMzsrc";

const LEVERAGE_LABEL = "Leverage Fee";
const SPOT_LABEL = "Spot Fee";
const REFERRAL_LABEL = "Share of fees to referrals";
const PROTOCOL_LABEL = "Share of fees to protocol";

// Protocol revenue is 75% of total fees; the remaining 25% is distributed to referrals
const PROTOCOL_FEE_RATE = 0.75;
const REFERRAL_FEE_RATE = 0.25;

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const query = `
    select
      coalesce(sum(case when to_owner = '${LEVERAGE_FEE_WALLET}' then amount_usd end), 0) as leverage_fee_usd,
      coalesce(sum(case when to_owner = '${SPOT_FEE_WALLET}' then amount_usd end), 0) as spot_fee_usd
    from tokens_solana.transfers
    where action = 'transfer'
      and to_owner in ('${LEVERAGE_FEE_WALLET}', '${SPOT_FEE_WALLET}')
      AND TIME_RANGE
  `;
  
  const result = await queryDuneSql(options, query);

  const leverageFeeUsd = Number(result?.[0]?.leverage_fee_usd ?? 0);
  const spotFeeUsd = Number(result?.[0]?.spot_fee_usd ?? 0);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(leverageFeeUsd, LEVERAGE_LABEL);
  dailyFees.addUSDValue(spotFeeUsd, SPOT_LABEL);
  
  dailyRevenue.addUSDValue(leverageFeeUsd * PROTOCOL_FEE_RATE, PROTOCOL_LABEL);
  dailyRevenue.addUSDValue(spotFeeUsd * PROTOCOL_FEE_RATE, PROTOCOL_LABEL);

  dailySupplySideRevenue.addUSDValue(leverageFeeUsd * REFERRAL_FEE_RATE, REFERRAL_LABEL);
  dailySupplySideRevenue.addUSDValue(spotFeeUsd * REFERRAL_FEE_RATE, REFERRAL_LABEL);
  
  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "Total fees are calculated as LeverageFee + SpotFee.",
  UserFees: "Users pay fees on leverage and spot trading.",
  Revenue: "Revenue equals protocol revenue (75% of total fees).",
  SupplySideRevenue: "Amount of 25% fees are distributed to referrals.",
  ProtocolRevenue: "Protocol revenue is 75% of total fees.",
};

const breakdownMethodology = {
  Fees: {
    [LEVERAGE_LABEL]: "1% fee per leverage transaction.",
    [SPOT_LABEL]: "0.6% fee per spot transaction; up to 50% instant referrals.",
  },
  Revenue: {
    [PROTOCOL_LABEL]: "Protocol revenue is 75% of total fees.",
  },
  ProtocolRevenue: {
    [PROTOCOL_LABEL]: "Protocol revenue is 75% of total fees.",
  },
  SupplySideRevenue: {
    [REFERRAL_LABEL]: "Amount of 25% fees are distributed to referrals.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  dependencies: [Dependencies.DUNE],
  chains: [CHAIN.SOLANA],
  start: "2024-08-15",
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
};

export default adapter;


