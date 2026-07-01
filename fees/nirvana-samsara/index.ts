import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const markets = [
  {
    // navSOL
    // mintMain: "So11111111111111111111111111111111111111112",
    revEscrowGroup: "BCYzijbWwmqRnsTWjGhHbneST2emQY36WcRAkbkhsQMt",
    revEscrowTenant: "B8jccpiKZjapgfw1ay6EH3pPnxqTmimsm2KsTZ9LSmjf",
    cashEscrow: "5hh9VjbkG3P2MqSiEtpUnCdboUwBrW4NKki5F6ntpyFC",
    liqVaultMain: "43vPhZeow3pgYa6zrPXASVQhdXTMfowyfNK87BYizhnL",
  },
  {
    // navZEC
    // mintMain: "A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS",
    revEscrowGroup: "CfE1xoGPJSmppr9N7ysTGq3tca5Xc22RbsbZycir1tVq",
    revEscrowTenant: "GPpY9M9XraDsbGBpTqtnoQJugktgMDBjGM6UxdQoD3UM",
    cashEscrow: "4YF8r5YDsX1hNisj8DYucLAP5pcp4fNWy4yiVLJvYwdp",
    liqVaultMain: "GreFb71nqhudTo5iYBUa8Czgb9ACCUuTDYpm98XdLUwk",
  },
  {
    // navETH
    // mintMain: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
    revEscrowGroup: "6GAADZA83t5Uzk6fwZ55zisfGJ7TFPbnWTRxfLYDF6JM",
    revEscrowTenant: "8XQi1aojXMgU4FEfvZmtytQjLAzi7Qyx3theFdCwhfhb",
    cashEscrow: "GmP7PFFTTSTWfNSf4iGQ8ASP5NQnZB75eDG9KXVjFYaU",
    liqVaultMain: "FpENWfyotJxhAFSsowsSERaEbWMrSopHBAgyGamrvg1a",
  },
  {
    // navCBBTC
    // mintMain: "cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij",
    revEscrowGroup: "2kfQBRonDGXQfo1WkohTbTq55k6RcuYsfEDzXBozvR5X",
    revEscrowTenant: "JCbzDUCn5aLiE6rvvvy5hZoYv3cJzkYFmr35A4SZxzyW",
    cashEscrow: "BAstqKsEqDPVjhUZVkYUqowzVsLLBHHRtfzUMxQMx9F1",
    liqVaultMain: "DH1tmXZ2sDe24o4JA6KPELt8G9nk8PfZHP6zfvAxZivM",
  },
];

// https://docs.nirvana.finance/s5-revenue-sharing/p3-revenue-flow
const DEV_SHARE = 0.5;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const escrowAddresses = markets.flatMap(m => [m.revEscrowGroup, m.revEscrowTenant]);
  const cashEscrowAddresses = markets.map(m => m.cashEscrow);
  const liqVaultAddresses = markets.map(m => m.liqVaultMain);

  const escrowList = escrowAddresses.map(a => `'${a}'`).join(', ');
  const cashEscrowList = cashEscrowAddresses.map(a => `'${a}'`).join(', ');
  const liqVaultList = liqVaultAddresses.map(a => `'${a}'`).join(', ');

  const query = `
    SELECT
      token_mint_address,
      SUM(amount) AS fees,
      'fee' AS type
    FROM tokens_solana.transfers
    WHERE TIME_RANGE
      AND to_token_account IN (
        ${escrowList}
      )
    GROUP BY token_mint_address

    UNION ALL

    SELECT
      token_mint_address,
      SUM(amount) AS fees,
      'supply' AS type
    FROM tokens_solana.transfers
    WHERE TIME_RANGE
      AND from_token_account IN (
        ${cashEscrowList}
      )
      AND to_token_account IN (
        ${liqVaultList}
      )
    GROUP BY token_mint_address  
  `;

  const results = await queryDuneSql(options, query);

  results.forEach((row: any) => {
    if (row.type === 'fee') {
      dailyFees.add(row.token_mint_address, row.fees, "Trading & Borrow Fees");
      dailyProtocolRevenue.add(row.token_mint_address, row.fees * DEV_SHARE, "Platform Operations");
    } else {
      dailyHoldersRevenue.add(row.token_mint_address, row.fees, "Floor Price Support");
    };
  });

  const stakingRewards = options.createBalances();
  stakingRewards.addBalances(dailyFees);
  stakingRewards.subtract(dailyProtocolRevenue);
  stakingRewards.subtract(dailyHoldersRevenue);

  dailyHoldersRevenue.addBalances(stakingRewards, "prANA Staking Rewards");

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Fees: "Buy, sell, and borrow fees paid by users across all Samsara markets.",
  UserFees: "Same as fees.",
  Revenue: "All fees collected by the protocol before redistribution.",
  ProtocolRevenue: "50% of fees go towards buying ANA and borrowing against it to fund platform operations.",
  HoldersRevenue: "50% of fees go to the liquidity vault to raise the navToken floor price and prANA stakers.",
};

const breakdownMethodology = {
  Fees: {
    "Trading & Borrow Fees": "Buy, sell, and borrow fees paid by users on Samsara markets.",
  },
  UserFees: {
    "Trading & Borrow Fees": "Buy, sell, and borrow fees paid by users on Samsara markets.",
  },
  Revenue: {
    "Trading & Borrow Fees": "Buy, sell, and borrow fees paid by users on Samsara markets.",
  },
  ProtocolRevenue: {
    "Platform Operations": "50% of collected fees are used to buy ANA and fund platform operations.",
  },
  HoldersRevenue: {
    "Floor Price Support": "Portion of fees donated to the liquidity vault to raise the navToken floor price.",
    "prANA Staking Rewards": "Portion of fees distributed to prANA stakers.",
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: {
    [CHAIN.SOLANA]: {
      start: "2024-12-15"
    },
  },
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE],
  methodology,
  breakdownMethodology,
};

export default adapter;