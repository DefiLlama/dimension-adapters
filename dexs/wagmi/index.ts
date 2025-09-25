import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter, } from "../../helpers/uniswap";

const uniV3LogAdapterConfig = {
  userFeesRatio: 1,
  revenueRatio: 0,
  protocolRevenueRatio: 0,
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Users paid 0.05%, 0.15%, 0.30%, or 1% per swap.',
    UserFees: 'Users paid 0.05%, 0.15%, 0.30%, or 1% per swap.',
    SupplySideRevenue: 'All swap fees go to LPs.',
    Revenue: 'No revenue from swap fees.',
    ProtocolRevenue: 'No revenue from swap fees.',
  },
  adapter: {
    [CHAIN.FANTOM]: {
      fetch: getUniV3LogAdapter({ factory: '0xaf20f5f19698f1D19351028cd7103B63D30DE7d7', ...uniV3LogAdapterConfig }),
      start: "2023-04-12",
    },
    [CHAIN.ETHEREUM]: {
      fetch: getUniV3LogAdapter({ factory: '0xB9a14EE1cd3417f3AcC988F61650895151abde24', ...uniV3LogAdapterConfig }),
      start: "2023-09-30",
    },
    [CHAIN.METIS]: {
      fetch: getUniV3LogAdapter({ factory: '0x8112E18a34b63964388a3B2984037d6a2EFE5B8A', ...uniV3LogAdapterConfig }),
      start: "2023-12-18",
    },
    [CHAIN.KAVA]: {
      fetch: getUniV3LogAdapter({ factory: '0x0e0Ce4D450c705F8a0B6Dd9d5123e3df2787D16B', ...uniV3LogAdapterConfig }),
      start: "2023-09-12",
    },
    [CHAIN.SONIC]: {
      fetch: getUniV3LogAdapter({ factory: '0x56CFC796bC88C9c7e1b38C2b0aF9B7120B079aef', ...uniV3LogAdapterConfig }),
      start: "2024-12-11",
    },
    [CHAIN.BASE]: {
      fetch: getUniV3LogAdapter({ factory: '0x576A1301B42942537d38FB147895fE83fB418fD4', ...uniV3LogAdapterConfig }),
      start: "2024-05-10",
    },
  },
};

export default adapter;
