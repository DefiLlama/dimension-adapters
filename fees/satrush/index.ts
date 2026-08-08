import fetchURL from "../../utils/fetchURL";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const BASE_URL = "https://api.satrush.io/api/v1/integration/stats/game";

const SAT_STRIKE_FEES = "Mining fees to Sat Strike";
const EPOCH_VAULT_FEES = "Mining fees to Epoch Vault";
const ONE_BTC_VAULT_FEES = "Mining fees to 1 BTC Vault";
const PROTOCOL_FEES = "Mining fees to Protocol";

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyFees = options.createBalances();

  const url = `${BASE_URL}?from_timestamp=${options.startTimestamp}&to_timestamp=${options.endTimestamp}`;
  const {
    total_strike_fee_usd,
    total_epoch_fee_usd,
    total_one_btc_fee_usd,
    total_protocol_fee_usd,
    total_deployed_usd,
  } = (await fetchURL(url)).data;

  dailyFees.addUSDValue(total_strike_fee_usd, SAT_STRIKE_FEES);
  dailyFees.addUSDValue(total_epoch_fee_usd, EPOCH_VAULT_FEES);
  dailyFees.addUSDValue(total_one_btc_fee_usd, ONE_BTC_VAULT_FEES);
  dailyFees.addUSDValue(total_protocol_fee_usd, PROTOCOL_FEES);

  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addUSDValue(total_strike_fee_usd, SAT_STRIKE_FEES);
  dailySupplySideRevenue.addUSDValue(total_epoch_fee_usd, EPOCH_VAULT_FEES);
  dailySupplySideRevenue.addUSDValue(total_one_btc_fee_usd, ONE_BTC_VAULT_FEES);

  const dailyProtocolRevenue = options.createBalances();
  dailyProtocolRevenue.addUSDValue(total_protocol_fee_usd, PROTOCOL_FEES);

  return {
    dailyVolume: total_deployed_usd || 0,
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
  };
};

const breakdownMethodology = {
  Fees: {
    [SAT_STRIKE_FEES]: "Fees accumulated in the Sat Strike prize pool.",
    [EPOCH_VAULT_FEES]: "Fees accumulated in the Epoch prize pool.",
    [ONE_BTC_VAULT_FEES]: "Fees accumulated in the One BTC prize pool.",
    [PROTOCOL_FEES]: "Fees retained by the protocol.",
  },
  SupplySideRevenue: {
    [SAT_STRIKE_FEES]:
      "Share of the value deployed by miners that goes to the Sat Strike prize pool, paid out to participating miners.",
    [EPOCH_VAULT_FEES]:
      "Share of the value deployed by miners that goes to the Epoch prize pool, paid out to participating miners.",
    [ONE_BTC_VAULT_FEES]:
      "Share of the value deployed by miners that goes to the One BTC prize pool, paid out to participating miners.",
  },
  Revenue: {
    [PROTOCOL_FEES]:
      "Share of the value deployed by miners that funds protocol operations and treasury.",
  },
  ProtocolRevenue: {
    [PROTOCOL_FEES]:
      "Share of the value deployed by miners that funds protocol operations and treasury.",
  },
};

const methodology = {
  Volume: "Total value deployed by miners participating in the rounds.",
  Fees: "Fees charged on the value deployed by miners, which fund the outsized rewards pools and the protocol fee.",
  SupplySideRevenue:
    "Share of fees that fills the prize pools, paid out to miners.",
  Revenue: "Protocol fee retained by the protocol.",
  ProtocolRevenue:
    "Protocol fee that funds protocol operations and treasury reserves.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  pullHourly: false,
  chains: [CHAIN.SOLANA],
  start: "2026-08-02",
  methodology,
  breakdownMethodology,
};

export default adapter;
