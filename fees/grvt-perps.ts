import ADDRESSES from "../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { addTokensReceived } from "../helpers/token";

// GRVT token on Ethereum
const GRVT_TOKEN = "0xad29f2723fcdbcf665f210f25e06f97477e417cf";
// Multisig that receives open-market buybacks and burns them
// First burn: 1.1M GRVT, tx 0x1e72a76bea183d3cd26ec4ad696eef8a091b4992079ee4868bf3926e5b2616d7
// https://chainwire.org/2026/10/20/grvt-burns-1-1-million-tokens-as-countdown-to-grvt-2-0-begins/
const BUYBACK_BURN_MULTISIG = "0x494e278d36c69587169424A5556EB7F75fa7d875";

const fetch = async (options: FetchOptions) => {
  const burned = await addTokensReceived({
    options,
    target: ADDRESSES.null,
    fromAddressFilter: BUYBACK_BURN_MULTISIG,
    token: GRVT_TOKEN,
  });

  const dailyHoldersRevenue = burned.clone(1, METRIC.TOKEN_BUY_BACK);

  return { dailyHoldersRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2026-10-19",
  methodology: {
    HoldersRevenue:
      "GRVT bought back on the open market by the GRVT Foundation token issuer and burned from the buyback multisig. Buybacks are discretionary and not funded from a disclosed share of exchange fees, so they are not counted as fees or revenue.",
  },
  breakdownMethodology: {
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: "GRVT bought on the open market and sent from the buyback multisig to the zero address.",
    },
  },
};

export default adapter;
