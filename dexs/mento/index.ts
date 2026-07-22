import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const event_swap = 'event Swap(address exchangeProvider, bytes32 indexed exchangeId, address indexed trader, address indexed tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)';

// PoolExchange struct; only config.spread is used (FixidityLib fraction, 1e24 = 100%).
const getPoolExchange = 'function getPoolExchange(bytes32 exchangeId) view returns ((address asset0, address asset1, address pricingModule, uint256 bucket0, uint256 bucket1, uint256 lastBucketUpdate, ((uint256) spread, address referenceRateFeedID, uint256 referenceRateResetFrequency, uint256 minimumReports, uint256 stablePoolResetSize) config))';

const FIXIDITY_1 = 10n ** 24n;

const contract_addresses: Record<string, string> = {
  [CHAIN.CELO]: '0x777a8255ca72412f0d706dc03c9d1987306b4cad',
};

const fetch = async (options: FetchOptions) => {
  const logs = await options.getLogs({
    target: contract_addresses[options.chain],
    eventAbi: event_swap,
  });

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  // Each pair sets its own spread; read it per unique exchange from its provider.
  const providerByExchange: Record<string, string> = {};
  logs.forEach((log) => { providerByExchange[log.exchangeId] = log.exchangeProvider; });
  const exchangeIds = Object.keys(providerByExchange);

  const pools = await options.api.multiCall({
    abi: getPoolExchange,
    calls: exchangeIds.map((id) => ({ target: providerByExchange[id], params: [id] })),
  });
  const spreadById: Record<string, bigint> = {};
  exchangeIds.forEach((id, i) => { spreadById[id] = BigInt(pools[i].config.spread[0]); });

  logs.forEach((log) => {
    dailyVolume.add(log.tokenOut, log.amountOut);
    // Swaps are priced as amountOut = (1 - spread) * fair value, so the spread * amountIn is kept by the reserve.
    const fee = (BigInt(log.amountIn) * spreadById[log.exchangeId]) / FIXIDITY_1;
    dailyFees.add(log.tokenIn, fee, 'Swap Spread');
    dailyRevenue.add(log.tokenIn, fee, 'Spread To Reserve');
  });

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Volume: "Value of tokens users received from Mento stablecoin swaps.",
  Fees: "Each swap is priced with a spread (0.02%-2% depending on the pair) applied to the amount swapped in; that spread is the fee.",
  Revenue: "All swap-spread fees. They accrue to the Mento Reserve backing the stablecoins; there are no liquidity providers, so nothing is paid to a supply side.",
  ProtocolRevenue: "All swap-spread fees, accruing to the Mento Reserve.",
};

const breakdownMethodology = {
  Fees: { 'Swap Spread': "Per-swap spread (0.02%–2% by pair) charged on the amount swapped in." },
  Revenue: { 'Spread To Reserve': "Swap-spread fees kept by the Mento Reserve." },
  ProtocolRevenue: { 'Spread To Reserve': "Swap-spread fees kept by the Mento Reserve." },
};

const adapters: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.CELO]: {
      fetch,
      start: '2025-03-26',
    },
  },
};

export default adapters;
