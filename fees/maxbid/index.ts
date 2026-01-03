import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

const LEVERAGE_FEE_WALLET = "8iMq4uShCbj4HAGKrHHd9EY4SmYor2y1XRP7Fh21BwHJ";
const SPOT_FEE_WALLET = "3JtcndcJ7EePpfYh6Hhs17qXNoeq2b9MCgidcreMzsrc";

const LEVERAGE_LABEL = "Leverage Fee";
const SPOT_LABEL = "Spot Fee";
const REFERRALS_LABEL = "Referral Rewards";
const PROTOCOL_REVENUE_LABEL = "Protocol Revenue";

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

  const totalFeesUsd = leverageFeeUsd + spotFeeUsd;

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(leverageFeeUsd, LEVERAGE_LABEL);
  dailyFees.addUSDValue(spotFeeUsd, SPOT_LABEL);

  const dailyRevenue = options.createBalances();
  dailyRevenue.addUSDValue(totalFeesUsd, PROTOCOL_REVENUE_LABEL);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  LeverageFee:
    "Maxbid charges a 1% fee per leverage transaction.",
  SpotFee:
    "Maxbid charges a 0.6% fee per spot transaction; up to 50% of this fee is paid instantly to referrers.",
  Fees: "Total fees are calculated as LeverageFee + SpotFee.",
  Revenue: "Revenue equals protocol revenue (75% of total fees).",
  ProtocolRevenue:
    "Protocol revenue is 75% of total fees; the remaining 25% is distributed to referrals.",
  HoldersRevenue: "Referral rewards paid out (25% of total fees).",
};

const breakdownMethodology = {
  Fees: {
    [LEVERAGE_LABEL]:
      "1% fee per leverage transaction.",
    [SPOT_LABEL]:
      "0.6% fee per spot transaction; up to 50% instant referrals.",
  },
  Revenue: {
    [PROTOCOL_REVENUE_LABEL]: "75% of total fees kept by the protocol.",
  },
  ProtocolRevenue: {
    [PROTOCOL_REVENUE_LABEL]: "75% of total fees kept by the protocol.",
  },
  HoldersRevenue: {
    [REFERRALS_LABEL]: "25% of total fees distributed to referrals.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  dependencies: [Dependencies.DUNE],
  chains: [CHAIN.SOLANA],
  start: "2025-08-15",
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
};

export default adapter;


