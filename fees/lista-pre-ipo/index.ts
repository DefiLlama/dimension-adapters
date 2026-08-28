import ADDRESSES from "../../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

/**
 * Lista Pre-IPO — Lista DAO's pre-IPO / pre-market distribution product on BSC.
 *
 * PreIPODistributor settles Lista's pre-IPO income in USDT to the DAO collection wallet.
 * Revenue = USDT received by the collection wallet straight from the distributor. All of it is
 * protocol income (no supply-side split), so Fees = Revenue = ProtocolRevenue.
 *
 * @doc https://listaorg.notion.site/Profit-cfd754931df449eaa9a207e38d3e0a54
 * @test npx ts-node --transpile-only cli/testAdapter.ts fees lista-pre-ipo
 */

const USDT = ADDRESSES.bsc.USDT;
const PRE_IPO_DISTRIBUTOR = "0x9f7526EDAa18278D4bC1fA6b63B749A649Cb1844";
const COLLECTION_WALLET = "0x09702Ea135d9D707DD51f530864f2B9220aAD87B";

const fetch = async (options: FetchOptions) => {
  const preIpoFees = options.createBalances();

  await addTokensReceived({
    options,
    target: COLLECTION_WALLET,
    fromAddressFilter: PRE_IPO_DISTRIBUTOR,
    tokens: [USDT],
    balances: preIpoFees,
  });

  const dailyFees = preIpoFees.clone(1, "Pre-IPO fees");

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "USDT distributed as Lista's pre-IPO income to the DAO collection wallet.",
  Revenue: "All pre-IPO income is collected by Lista DAO.",
  ProtocolRevenue: "All pre-IPO income is collected by Lista DAO.",
};

const breakdownMethodology = {
  Fees: {
    "Pre-IPO fees": "USDT distributed as Lista's pre-IPO income to the DAO collection wallet.",
  },
  Revenue: {
    "Pre-IPO income": "All pre-IPO income is collected by Lista DAO.",
  },
  ProtocolRevenue: {
    "Pre-IPO income": "All pre-IPO income is collected by Lista DAO.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: "2026-08-01",
    },
  },
  breakdownMethodology,
  pullHourly: true,
};

export default adapter;
