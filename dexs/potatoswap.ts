import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const API_URL = "https://v3.potatoswap.finance/api/pool/list-all";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const response = await fetchURL(API_URL);
  const pools = response.data.pools;

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  for (const { protocol_version, volume_24h_usd, fee_24h_usd } of pools) {
    if (protocol_version !== "v2") continue;

    dailyVolume.addUSDValue(Number(volume_24h_usd));
    dailyFees.addUSDValue(Number(fee_24h_usd));
  }

  const dailySupplySideRevenue = dailyFees.clone(0.17 / 0.25);
  const dailyHoldersRevenue = dailyFees.clone(0.08 / 0.25);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyHoldersRevenue,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "PotatoSwap charges a 0.25% swap fee on v2 pools.",
  UserFees: "Users pay a 0.25% swap fee per trade.",
  SupplySideRevenue:
    "Liquidity providers receive 0.17% of swap volume.",
  HoldersRevenue:
    "0.08% of swap volume is distributed to vePOT holders.",
  ProtocolRevenue:
    "The protocol does not retain a direct fee share.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.XLAYER],
  runAtCurrTime: true,
  methodology,
};

export default adapter;