import { SimpleAdapter } from "../../adapters/types";
import { getFetch } from "../../dexs/myx-finance/helpers.";
import { CHAIN } from "../../helpers/chains";

const methodology = {
  Volume: "Sum of the open/close/liquidation of positions tracked from settlement contracts.",
  Fees: 'Total trading fees collected from traders',
  Revenue: 'Share of trading fees for treasury, ecosystem fund, keepers.',
  ProtocolRevenue: 'Share of trading fees for protocol treasury',
  SupplySideRevenue: 'Share of trading fees for MYX liquidity providers.',
}

const adapter: SimpleAdapter = {
  methodology,
  version: 2,
  fetch: getFetch('fees'),
  adapter: {
    [CHAIN.ARBITRUM]: { start: '2024-01-31', },
    [CHAIN.LINEA]: { start: '2024-02-21', },
    [CHAIN.BSC]: { start: '2025-03-16', },
  }
}

export default adapter;
