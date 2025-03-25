import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";
import { queryDuneSql } from "../../helpers/dune";

// FEE WALLETS:
const FEE_WALLETS = {
  [CHAIN.SOLANA]: ["7juXaFuWZ3nkiaYBN8JkKFGvEY56Gh15h1kBGNdUfeU"],
  [CHAIN.ETHEREUM]: ["0x2e6C8927285353F24A00fcBAF605C54E2E18ea83", "0x4b04213c2774f77e60702880654206b116d00508"],
  [CHAIN.AVAX]: ["0x4F3Dea8CE389dae557B352595e247e51c9572f41"],
  [CHAIN.CRONOS]: ["0x4B04213C2774f77e60702880654206B116D00508"],
  //   [CHAIN.BITROCK]: ["0x5C454D1BB2FD6a9A45310CFBb1d682936F268dd6"],
  [CHAIN.CORE]: ["0x5C454D1BB2FD6a9A45310CFBb1d682936F268dd6"],
  [CHAIN.ZETA]: ["0x31b6a44e35d976df0a1db58184781fb562ec9205"],
  [CHAIN.TON]: ["UQD6l0yXeMKyWOQuPGDq9Z8eDfLbD3XO0UQRViGOvRv9ZymT"],
  [CHAIN.SUI]: ["0xb389a630b3995915e8cc94a202363a82d830e7dc5d27062069f5f691216bf1f2"],
  [CHAIN.BSC]: ["0x2e6C8927285353F24A00fcBAF605C54E2E18ea83", "0x4b04213c2774f77e60702880654206b116d00508"],
  [CHAIN.ARBITRUM]: ["0x2e6C8927285353F24A00fcBAF605C54E2E18ea83", "0x4b04213c2774f77e60702880654206b116d00508"],
  [CHAIN.POLYGON]: ["0x2e6C8927285353F24A00fcBAF605C54E2E18ea83", "0x4b04213c2774f77e60702880654206b116d00508"],
  [CHAIN.BASE]: ["0x2e6C8927285353F24A00fcBAF605C54E2E18ea83", "0x4b04213c2774f77e60702880654206b116d00508"],
  [CHAIN.UNICHAIN]: ["0x2e6C8927285353F24A00fcBAF605C54E2E18ea83", "0x4b04213c2774f77e60702880654206b116d00508"]
};

const SOLANA_PINKSALE_PROGRAM = "Pinks8fXRcJ8EpNjK4vCf7saJ5hFeP9zRXGPwZrTukQ"

const fetchSolanaFees: any = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, targets: FEE_WALLETS[CHAIN.SOLANA] })
  // const dailyFees = options.createBalances();

  const wsolQuery = `
    SELECT
        SUM(amount/10e9) as total_wsol
    FROM tokens_solana.transfers
    WHERE
        outer_executing_account = '${SOLANA_PINKSALE_PROGRAM}'
        AND token_mint_address = 'So11111111111111111111111111111111111111112'
        AND to_owner = '${FEE_WALLETS[CHAIN.SOLANA][0]}'
        AND TIME_RANGE
  `;

  const wsolResults = await queryDuneSql(options, wsolQuery);
  if (wsolResults[0]?.total_wsol) {
    dailyFees.add('So11111111111111111111111111111111111111112', wsolResults[0].total_wsol * 1e9);
  }
  // console.log(dailyFees);
  return { dailyFees, dailyRevenue: dailyFees, }
}

const fetch = async (options: FetchOptions) => {
  // https://docs.pinksale.finance/service-fees
  const dailyFees = options.createBalances();

  const feeWallet = FEE_WALLETS[options.chain];
  if (!feeWallet) return { dailyFees, dailyRevenue: dailyFees };

  const query = `
      SELECT
          sum(value / 1e18) as total_gas_token_amount
      FROM
         CHAIN.traces
      WHERE
          "to" = from_hex('${feeWallet[0].toLowerCase()}')
          AND type = 'call'
          AND call_type = 'call'
          AND success = true
          AND value > 0
          AND TIME_RANGE
  `;

  const results = await queryDuneSql(options, query);

  if (results[0]?.total_gas_token_amount) {
    dailyFees.addGasToken(results[0].total_gas_token_amount * 1e18);
  }

  return { dailyFees, dailyRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2021-10-30',
    },
    [CHAIN.BSC]: {
      fetch,
      start: '2021-06-01',
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: '2024-12-06',
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2023-02-01',
    },
    [CHAIN.AVAX]: {
      fetch,
      start: '2021-09-18',
    },
    // [CHAIN.CRONOS]: {
    //   fetch,
    //   start: '2022-04-01',
    // },
    // [CHAIN.CORE]: {
    //   fetch,
    //   start: '2023-10-19',
    // },
    // [CHAIN.ZETA]: {
    //   fetch,
    //   start: '2025-02-07',
    // },
    [CHAIN.BASE]: {
      fetch,
      start: '2024-04-05',
    },
    [CHAIN.UNICHAIN]: {
      fetch,
      start: '2025-02-21',
    },
    [CHAIN.SOLANA]: {
      fetch: fetchSolanaFees,
      start: '2024-02-04',
    },
  },
};

export default adapter;