import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const APTOS_REST_API = "https://api.mainnet.aptoslabs.com";
const MOVE_DOLLAR_ADDRESS = "0x6f986d146e4a90b828d8c12c14b6f4e003fdff11a8eecceceb63744363eaac01";
const FIXED_POINT_64 = 2 ** 64;
const MOD_DECIMALS = 1e8;
const YEAR_SECONDS = 365 * 24 * 60 * 60;

interface AptosResource {
  type: string;
  data: any;
}

const extractCollateral = (type: string, resource: string) =>
  type.match(new RegExp(`${MOVE_DOLLAR_ADDRESS}::vault::${resource}<(.+)>$`))?.[1];

const getVersionFromTimestamp = async (timestamp: number) => {
  const ledger = await httpGet(`${APTOS_REST_API}/v1`);
  const targetMicros = timestamp * 1e6;
  if (Number(ledger.ledger_timestamp) <= targetMicros) return ledger.ledger_version;

  let low = Number(ledger.oldest_ledger_version ?? 0);
  let high = Number(ledger.ledger_version);

  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const block = await httpGet(`${APTOS_REST_API}/v1/blocks/by_version/${mid}`);
    if (Number(block.block_timestamp) <= targetMicros) low = Number(block.last_version);
    else high = Number(block.first_version) - 1;
  }

  return low;
};

const fetchResources = async (timestamp: number) => {
  const ledgerVersion = await getVersionFromTimestamp(timestamp);
  return httpGet(`${APTOS_REST_API}/v1/accounts/${MOVE_DOLLAR_ADDRESS}/resources?ledger_version=${ledgerVersion}&limit=9999`);
};

const fetch = async (timestamp: number, _chainBlocks: any, options: FetchOptions) => {
  const resources: AptosResource[] = await fetchResources(timestamp);
  const liabilities: Record<string, number> = {};
  const annualRates: Record<string, number> = {};

  resources.forEach(({ type, data }) => {
    const vaultCollateral = extractCollateral(type, "Vaults");
    if (vaultCollateral) liabilities[vaultCollateral] = Number(data.total_liability ?? 0) / MOD_DECIMALS;

    const paramsCollateral = extractCollateral(type, "VaultCollateralParams");
    if (paramsCollateral) annualRates[paramsCollateral] = Number(data.interest_annual_rate_ratio?.v ?? 0) / FIXED_POINT_64;
  });

  const windowSeconds = options.endTimestamp - options.startTimestamp;
  const dailyFees = Object.entries(liabilities).reduce((sum, [collateral, liability]) => {
    return sum + liability * (annualRates[collateral] ?? 0) * windowSeconds / YEAR_SECONDS;
  }, 0);

  return {
    dailyFees,
  };
};

const adapter: SimpleAdapter = {
  methodology: "Estimates borrower interest from Move Dollar vault liabilities and annual rates stored on-chain. MOD is treated as USD-pegged.",
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: '2023-04-05',
    },
  },
};

export default adapter;
