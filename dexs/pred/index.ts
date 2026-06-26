import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getPolymarketVolume } from "../../helpers/polymarket";

// https://pred-1.gitbook.io/pred-docs
// https://github.com/orgs/pred-org/repositories

// Latest deployments
const CTF_EXCHANGE = "0x90B036c618196634200F0323c420C50CdBBCf07C";
const CROSS_MATCHING_ADAPTER = "0xd3460060A8363C24babC411a11444d5d985342EF";

// Legacy (previous latest)
const CTF_EXCHANGE_LEGACY = "0x3d6726aF35Ae695E056e6e2ebDB5c813b7d8B6CC";
const CROSS_MATCHING_ADAPTER_LEGACY = "0x74AD4708928628c20608F10751EaFBE391197b0F";

const CTF_EXCHANGE_LEGACY_V2 = "0xcc9D4EA7c86f2d6d67a44BC5e7A8932699ddDDa1";
const CROSS_MATCHING_ADAPTER_LEGACY_V2 = "0x7B39c530C3F2Ea4056f1a3bBa777F82bBDFB047A";

const CTF_EXCHANGE_LEGACY_V3 = "0x1938Af63B717B80ea62ccB4CCBf799F8a28dEFB0";
const CROSS_MATCHING_ADAPTER_LEGACY_V3 = "0xC574A05e622A769e6aB14293070cDF6cADB55F98";

const USDC = "0x833589fCD6eDb6E08f4c7c32D4f71b54bdA02913";

const fetch = async (options: FetchOptions) => {
  const { dailyVolume, dailyNotionalVolume } = await getPolymarketVolume({
    options,
    exchanges: [
      CTF_EXCHANGE,
      CROSS_MATCHING_ADAPTER,
      CTF_EXCHANGE_LEGACY,
      CROSS_MATCHING_ADAPTER_LEGACY,
      CTF_EXCHANGE_LEGACY_V2,
      CROSS_MATCHING_ADAPTER_LEGACY_V2,
      CTF_EXCHANGE_LEGACY_V3,
      CROSS_MATCHING_ADAPTER_LEGACY_V3,
    ],
    currency: USDC,
  });

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
