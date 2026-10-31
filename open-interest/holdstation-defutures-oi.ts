import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Holdstation DeFutures is a gTrade v5 fork
const ABIS = {
  priceAggregator: "address:priceAggregator",
  pairsStorage: "address:pairsStorage",
  pairsCount: "uint256:pairsCount",
  collateral: "address:usdc",
  openInterestUsdc: "function openInterestUsdc(uint256 pairIndex, uint256 side) view returns (uint256)",
};

type StorageConfig = { storage: string; migratedStorage?: { storage: string; from: number } };

const chainConfig: Record<string, StorageConfig & { start: string; deadFrom?: string }> = {
  [CHAIN.WC]: {
    storage: "0xdE605A918C466e74A2a12865EFE616d51391312A",
    migratedStorage: { storage: "0x441b81f9ACeBEc2C855E8DbDaA82967fEa185169", from: 1769681009 },
    start: "2025-06-04",
  },
  [CHAIN.BSC]: {
    storage: "0x8E2D60AC9238C46422005C8A8855d2ece37B3f86",
    start: "2025-08-18",
    deadFrom: "2026-01-27",
  },
};

const getStorage = ({ storage, migratedStorage }: StorageConfig, options: FetchOptions) =>
  migratedStorage && options.endTimestamp >= migratedStorage.from ? migratedStorage.storage : storage;

const fetch = async (options: FetchOptions) => {
  const storage = getStorage(chainConfig[options.chain], options);
  const api = options.api;
  const longOpenInterestAtEnd = options.createBalances();
  const shortOpenInterestAtEnd = options.createBalances();
  const openInterestAtEnd = options.createBalances();

  const [priceAggregator, collateral] = await api.batchCall([
    { target: storage, abi: ABIS.priceAggregator },
    { target: storage, abi: ABIS.collateral },
  ]);
  const pairsStorage = await api.call({ target: priceAggregator, abi: ABIS.pairsStorage });
  const pairsCount = Number(await api.call({ target: pairsStorage, abi: ABIS.pairsCount }));

  const calls = Array.from({ length: pairsCount }, (_, pairIndex) => [{ params: [pairIndex, 0] }, { params: [pairIndex, 1] }]).flat();
  const ois = await api.multiCall({ target: storage, abi: ABIS.openInterestUsdc, calls });

  for (let i = 0; i < pairsCount; i++) {
    const longOi = ois[i * 2];
    const shortOi = ois[i * 2 + 1];
    longOpenInterestAtEnd.add(collateral, longOi);
    shortOpenInterestAtEnd.add(collateral, shortOi);
    openInterestAtEnd.add(collateral, longOi);
    openInterestAtEnd.add(collateral, shortOi);
  }

  // pool venue with no single-sided field: average the two sides instead of summing them
  openInterestAtEnd.resizeBy(0.5);
  longOpenInterestAtEnd.resizeBy(0.5);
  shortOpenInterestAtEnd.resizeBy(0.5);

  return { openInterestAtEnd, longOpenInterestAtEnd, shortOpenInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 2,
  // OI is a snapshot; hourly records would be summed into the daily value
  pullHourly: false,
  fetch,
  adapter: chainConfig,
  methodology: {
    OpenInterest: "Leveraged notional of open trader positions, read from the Holdstation trading storage contract at the end of the period and valued at the collateral price (WLD on World Chain, USD stablecoins on BSC). Long and short are averaged into one figure because traders trade against the vault and there is no single-sided field.",
  },
};

export default adapter;
