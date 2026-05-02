import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Protocol reference: https://xaue.com/xaue_protocol_info_en.v1.pdf
// The document describes XAUE value accrual through Oracle NAV growth and does not disclose protocol fee rates.
const XAUE = "0xd5D6840ed95F58FAf537865DcA15D5f99195F87a";
const ORACLE = "0x0618BD112C396060d2b37B537b3d92e757644169";

const PRICE_DECIMALS = 18n;

const ABIS = {
  totalSupply: "uint256:totalSupply",
  getLatestPrice: "uint256:getLatestPrice",
  asset: "address:asset",
  assetDecimals: "uint8:assetDecimals",
  decimals: "uint8:decimals",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  const [priceStart, priceEnd, totalSupply, asset, assetDecimals, shareDecimals] = await Promise.all([
    options.fromApi.call({ abi: ABIS.getLatestPrice, target: ORACLE }),
    options.toApi.call({ abi: ABIS.getLatestPrice, target: ORACLE }),
    options.fromApi.call({ abi: ABIS.totalSupply, target: XAUE }),
    options.fromApi.call({ abi: ABIS.asset, target: XAUE }),
    options.fromApi.call({ abi: ABIS.assetDecimals, target: XAUE }),
    options.fromApi.call({ abi: ABIS.decimals, target: XAUE }),
  ]);

  const priceDelta = BigInt(priceEnd) - BigInt(priceStart);

  if (priceDelta > 0n) {
    const conversionScale = 10n ** (BigInt(shareDecimals) + PRICE_DECIMALS - BigInt(assetDecimals));
    const yieldInAsset = (BigInt(totalSupply) * priceDelta) / conversionScale;
    dailyFees.add(asset, yieldInAsset, METRIC.ASSETS_YIELDS);
    dailySupplySideRevenue.add(asset, yieldInAsset, METRIC.ASSETS_YIELDS);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2026-03-24", // first full UTC day after block 24718738, Mar-23-2026 07:30:59 AM UTC
    },
  },
  methodology: {
    Fees: "Yield accrued to XAUE holders from Oracle NAV growth. The Oracle computes NAV linearly from baseNetValue and currentAPR; daily yield is start-of-period XAUE supply multiplied by the NAV increase.",
    Revenue: "No protocol revenue or management/performance fee is disclosed in the protocol information document, so revenue is reported as zero.",
    ProtocolRevenue: "No protocol revenue or management/performance fee is disclosed in the protocol information document, so protocol revenue is reported as zero.",
    SupplySideRevenue: "Yield accrued to XAUE holders through XAUE NAV appreciation, denominated in XAUt.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.ASSETS_YIELDS]: "Yield generated from XAUE Oracle NAV appreciation.",
    },
    SupplySideRevenue: {
      [METRIC.ASSETS_YIELDS]: "Yield distributed to XAUE holders through NAV appreciation.",
    },
  },
};

export default adapter;
