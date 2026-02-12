import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getVersionFromTimestamp, octasToApt, view } from "../helpers/aptos";
import { METRIC } from "../helpers/metrics";

// The emojicoin package address.
const MAINNET_PACKAGE_ADDRESS = "0xface729284ae5729100b3a9ad7f7cc025ea09739cd6e7252aff0beb53619cafe";

// The emojicoin module.
const MODULE = "emojicoin_dot_fun";

// Block close to the start date but before it.
const DEPLOYED_AT_BLOCK = 254000000;

// Return type of the `registry_view` view function.
type RegistryView = {
  cumulative_chat_messages: { value: string },
  cumulative_integrator_fees: { value: string },
  cumulative_quote_volume: { value: string },
  cumulative_swaps: { value: string },
  fully_diluted_value: { value: string },
  last_bump_time: string,
  market_cap: { value: string },
  n_markets: string,
  nonce: { value: string },
  registry_address: string,
  total_quote_locked: { value: string },
  total_value_locked: { value: string }
};

// Query the `registry_view` view function at the given version.
async function registryView(version?: number) {
  const viewFunction = `${MAINNET_PACKAGE_ADDRESS}::${MODULE}::registry_view`;
  const [result] =
    await view<[RegistryView]>(viewFunction, [], [], version);
  return result
}

const fetch = async (options: FetchOptions) => {
  // Convert timestamps to versions.
  const startVersion = await getVersionFromTimestamp(new Date(options.startTimestamp * 1000), DEPLOYED_AT_BLOCK);
  const endVersion = await getVersionFromTimestamp(new Date(options.endTimestamp * 1000), DEPLOYED_AT_BLOCK);

  // Get the view results at the start and end bounds.
  const viewStart = await registryView(startVersion);
  const viewEnd = await registryView(endVersion);

  // Extract fees and volume from `registry_view` results.
  const feesEnd = BigInt(viewEnd.cumulative_integrator_fees.value);
  const feesStart = BigInt(viewStart.cumulative_integrator_fees.value);
  const volumeEnd = BigInt(viewEnd.cumulative_quote_volume.value);
  const volumeStart = BigInt(viewStart.cumulative_quote_volume.value);

  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();

  dailyFees.addCGToken('aptos', octasToApt(feesEnd - feesStart), METRIC.TRADING_FEES);
  dailyVolume.addCGToken('aptos', octasToApt(volumeEnd - volumeStart));

  return {
    dailyFees,
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.APTOS],
  start: '2024-11-20',
  methodology: {
    Fees: "Tokens trading and launching fees paid by users.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: 'Cumulative integrator fees denominated in APT, computed as the difference between the end and start of the period from the on-chain registry view.',
    },
  }
};

export default adapter;
