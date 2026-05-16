import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const NET_SHARE = 90n;

const CONFIG: Record<string, {
  vaults: string[];
  muBond: string;
  priceFeed: string;
}> = {
  [CHAIN.MONAD]: {
    vaults: ["0x9c82eB49B51F7Dc61e22Ff347931CA32aDc6cd90"],
    muBond: "0x336D414754967C6682B5A665C7DAF6F1409E63e8",
    priceFeed: "0x8B9670C5E4D9F1C14f1F9fe625Dd099924aD4D4f",
  },
  [CHAIN.ETHEREUM]: {
    vaults: ["0xa6142276526724CFaEe9151d280385BdF43e0503"],
    muBond: "0x09AD9c6DcadCc3aB0b3E107E8E7DA69c2eEa8599",
    priceFeed: "0xE200C42374258c4c192f35e4bEB5E489b0cbc0a4",
  },
};

const ABIS = {
  asset: "function asset() view returns (address)",
  convertToAssets: "function convertToAssets(uint256 shares) view returns (uint256)",
  getPrice: "function getPrice(address token) view returns (uint256, uint8)",
  totalSupply: "erc20:totalSupply",
  decimals: "erc20:decimals",
};

const fetchVaultFees = async (options: FetchOptions, vault: string, dailyFees: any, dailyRevenue: any, dailySupplySideRevenue: any) => {
  const { api, fromApi, toApi } = options;

  const [asset, decimals] = await Promise.all([
    api.call({ target: vault, abi: ABIS.asset }),
    api.call({ target: vault, abi: ABIS.decimals }),
  ]);

  const unit = BigInt(10) ** BigInt(decimals);

  const [totalSupply, rateStart, rateEnd] = await Promise.all([
    api.call({ target: vault, abi: ABIS.totalSupply }),
    fromApi.call({ target: vault, abi: ABIS.convertToAssets, params: [unit.toString()] }),
    toApi.call({ target: vault, abi: ABIS.convertToAssets, params: [unit.toString()] }),
  ]);

  const rateDiff = BigInt(rateEnd) - BigInt(rateStart);
  if (rateDiff <= 0n) return;

  const netYield = (BigInt(totalSupply) * rateDiff) / unit;
  const grossYield = (netYield * 100n) / NET_SHARE;
  const protocolFee = grossYield - netYield;

  dailyFees.add(asset, grossYield, METRIC.ASSETS_YIELDS);
  dailySupplySideRevenue.add(asset, netYield, METRIC.ASSETS_YIELDS);
  dailyRevenue.add(asset, protocolFee, METRIC.PERFORMANCE_FEES);
};

const fetchMuBondFees = async (options: FetchOptions, cfg: typeof CONFIG[string], dailyFees: any, dailyRevenue: any, dailySupplySideRevenue: any) => {
  const { api, fromApi, toApi } = options;

  const [decimals, totalSupply, priceDataStart, priceDataEnd] = await Promise.all([
    api.call({ target: cfg.muBond, abi: ABIS.decimals }),
    api.call({ target: cfg.muBond, abi: ABIS.totalSupply }),
    fromApi.call({ target: cfg.priceFeed, abi: ABIS.getPrice, params: [cfg.muBond] }),
    toApi.call({ target: cfg.priceFeed, abi: ABIS.getPrice, params: [cfg.muBond] }),
  ]);

  const priceStart = BigInt(priceDataStart[0]);
  const priceEnd = BigInt(priceDataEnd[0]);
  const priceDecimals = Number(priceDataEnd[1]);

  if (priceEnd <= priceStart) return;

  const priceDiff = priceEnd - priceStart;

  const divisor = BigInt(10) ** BigInt(Number(decimals) + priceDecimals);
  const netYield = Number(BigInt(totalSupply) * priceDiff / divisor);
  if (netYield <= 0) return;

  const grossYield = (netYield * 100) / Number(NET_SHARE);
  const protocolFee = grossYield - netYield;

  dailyFees.addUSDValue(grossYield, METRIC.ASSETS_YIELDS);
  dailySupplySideRevenue.addUSDValue(netYield, METRIC.ASSETS_YIELDS);
  dailyRevenue.addUSDValue(protocolFee, METRIC.PERFORMANCE_FEES);
};

const fetch = async (options: FetchOptions) => {
  const cfg = CONFIG[options.chain];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  await Promise.all([
    ...cfg.vaults.map((vault) => fetchVaultFees(options, vault, dailyFees, dailyRevenue, dailySupplySideRevenue)),
    fetchMuBondFees(options, cfg, dailyFees, dailyRevenue, dailySupplySideRevenue),
  ]);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.MONAD]: { fetch, start: "2025-05-01" },
    [CHAIN.ETHEREUM]: { fetch, start: "2025-05-01" },
  },
  allowNegativeValue: true,
  methodology: {
    Fees: "Gross yield from Mu Digital RWA strategies (Asian corporate bonds and private credit).",
    Revenue: "10% performance fee on realized yield. No management fees or mint/redeem fees.",
    ProtocolRevenue: "All protocol revenue from the 10% performance fee.",
    SupplySideRevenue: "Net yield distributed to loAZND depositors and muBOND holders (90% of gross yield).",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.ASSETS_YIELDS]: "Gross yield from loAZND vault (ERC-4626) and muBOND price appreciation.",
    },
    Revenue: {
      [METRIC.PERFORMANCE_FEES]: "10% performance fee on realized strategy yield.",
    },
    ProtocolRevenue: {
      [METRIC.PERFORMANCE_FEES]: "10% performance fee collected by the protocol.",
    },
    SupplySideRevenue: {
      [METRIC.ASSETS_YIELDS]: "Net yield distributed to holders via loAZND vault repricing and muBOND price appreciation.",
    },
  },
};

export default adapter;
