import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getPolymarketVolume } from "../../helpers/polymarket";

// https://pred-1.gitbook.io/pred-docs
// https://github.com/orgs/pred-org/repositories
const NEG_RISK_CTF_EXCHANGE = "0x1938Af63B717B80ea62ccB4CCBf799F8a28dEFB0";
const CROSS_MATCHING_ADAPTER = "0xC574A05e622A769e6aB14293070cDF6cADB55F98";
const NEG_RISK_CTF_EXCHANGE_LEGACY = "0xcc9D4EA7c86f2d6d67a44BC5e7A8932699ddDDa1";
const CROSS_MATCHING_ADAPTER_LEGACY = "0x7B39c530C3F2Ea4056f1a3bBa777F82bBDFB047A";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

const fetch = async (options: FetchOptions) => {
  const { dailyVolume, dailyNotionalVolume } = await getPolymarketVolume({ options, exchanges: [NEG_RISK_CTF_EXCHANGE, CROSS_MATCHING_ADAPTER, NEG_RISK_CTF_EXCHANGE_LEGACY, CROSS_MATCHING_ADAPTER_LEGACY], currency: USDC });

  return {
    dailyVolume,
    dailyNotionalVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2026-02-05",
    },
  },
};

export default adapter;
