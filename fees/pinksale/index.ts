import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getETHReceived, getSolanaReceived } from "../../helpers/token";

// FEE WALLETS:
const FEE_WALLETS: any = {
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


const fetchSolanaFees: any = async (_: any, _1: any, options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, targets: FEE_WALLETS[CHAIN.SOLANA] })
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const fetch = async (_: any, _1: any, options: FetchOptions) => {
  // https://docs.pinksale.finance/service-fees

  const feeWallet = FEE_WALLETS[options.chain];
  const dailyFees = await getETHReceived({ options, targets: feeWallet, });

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, dailyHoldersRevenue: 0, };
};

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: "All fees paid by users by using PinkSale services.",
    Revenue: "All fees are collected by PinkSale protocol.",
    ProtocolRevenue: "Trading fees are collected by PinkSale protocol.",
    HoldersRevenue: "No revenue share to PINK token holders.",
  },
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2021-10-30', },
    [CHAIN.BSC]: {start: '2021-06-01', },
    [CHAIN.POLYGON]: {start: '2024-12-06', },
    [CHAIN.ARBITRUM]: {start: '2023-02-01', },
    [CHAIN.AVAX]: {start: '2021-09-18', },
    // [CHAIN.CRONOS]: {  start: '2022-04-01',},
    // [CHAIN.CORE]: {  start: '2023-10-19',},
    // [CHAIN.ZETA]: {  start: '2025-02-07',},
    [CHAIN.BASE]: {start: '2024-04-05', },
    [CHAIN.UNICHAIN]: {start: '2025-02-21', },
    [CHAIN.SOLANA]: { fetch: fetchSolanaFees, start: '2024-02-04', },
  },
};

export default adapter;