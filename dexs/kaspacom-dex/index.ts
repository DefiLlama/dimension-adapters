import { SimpleAdapter, Fetch } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const BACKEND_API_URL = 'https://api-defi.kaspa.com/dex';
const START_TIMESTAMP = 1758844800;
const DAY_IN_SECONDS = 86400;

const methodology = {
  Fees: "Trades incur a 1% swap fee that is entirely paid by users.",
  UserFees: "Users pay the 1% swap fee on each swap.",
  Revenue: "The protocol collects 1/6 of accumulated LP fees when liquidity is moved.",
  ProtocolRevenue: "Factory captures ~0.1667% of swap volume (1/6 of fees) via LP token claims.",
  SupplySideRevenue: "Liquidity providers keep the remaining 5/6 of the 1% swap fee (~0.8333%).",
  HoldersRevenue: "No direct revenue share to token holders.",
};

const fetch: Fetch = async (_timestamp, _chainBlocks, { startOfDay, createBalances }) => {
  const minDate = startOfDay;
  const maxDate = startOfDay + DAY_IN_SECONDS;

  const url = `${BACKEND_API_URL}/most-traded/pairs?minDate=${minDate}&maxDate=${maxDate}`;
  
  const response = await fetchURL(url).catch(() => ({ pairs: [] }));
  
  const pairs = Array.isArray(response?.pairs) ? response.pairs : [];
  
  let totalVolumeKas = 0;
  pairs.forEach((entry) => {
    const volumeKas = Number(entry.amountKAS);
    if (Number.isFinite(volumeKas) && volumeKas > 0) {
      totalVolumeKas += volumeKas;
    }
  });

  const dailyVolume = createBalances();
  dailyVolume.addCGToken("kaspa", totalVolumeKas);

  const dailyFees = createBalances();
  const protocolRevenue = createBalances();
  const supplyRevenue = createBalances();

  const totalFeesKas = totalVolumeKas * 0.01;
  const protocolShareKas = totalFeesKas / 6;
  const supplyShareKas = totalFeesKas - protocolShareKas;

  dailyFees.addCGToken("kaspa", totalFeesKas);
  protocolRevenue.addCGToken("kaspa", protocolShareKas);
  supplyRevenue.addCGToken("kaspa", supplyShareKas);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: protocolRevenue,
    dailyProtocolRevenue: protocolRevenue,
    dailySupplySideRevenue: supplyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  methodology,
  adapter: {
    [CHAIN.KASPLEX]: {
      fetch,
      start: START_TIMESTAMP,
    },
  },
};

export default adapter;

