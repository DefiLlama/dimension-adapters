import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { addTokensReceived } from "../helpers/token";

const AEVO = "0xb528edbef013aff855ac3c50b381f253af13b997";

// DAO Treasury Safes named in AGP-3: https://agp.aevo.xyz/approved-proposals/agp-3-aevonomics/proposal/dao-treasury-and-committees-restructuring
const DAO_TREASURY = "0xdaeada3d210d2f45874724beea03c7d4bbd41674";
const DAO_TREASURY_2 = "0x8d7bef8be1ba337e91fda9dc817516bcb7cffd47";

// The six 2024 buybacks listed at https://agp.aevo.xyz/approved-proposals/agp-2-surplus-revenue-buyback-policy/proposal/previous-buybacks, then the May and June 2025 AGP-2 deliveries
const TREASURY_BUYBACK_TXS = new Set([
  "0xf89a74654374715d432537d451dc2d0a91a0559c0b6ac98a9cde02bf9ff53586",
  "0xae9058ce3d2dd39ff90954fab965bee9aed7c21678dca8f7f45f2924e5339771",
  "0xda92e523abf6375a6fda98576362b2dad3ccaa565056ddca36cec0f75d1b049d",
  "0xc6892f7911a93bb473121c16534859b762972af71e7b814064e50874ed432351",
  "0x6cad278addbf62745d9f751bae92d120663e7a402c373ebbef303497947faceb",
  "0xbd7b5e1167300a1e0f69da728705fe2826cbff6984bce3c38fdd97e9be735888",
  "0x06367e26065b1d295d79dc14bfac5ad884c4f9c73fc391014d49193b3dd7ee1d",
  "0x2bb983ae631ca28f80cb1dc5b569acbc5edfeaa8569e37cd5d2c0dbcf2d5f4c0",
]);

// AGP-3 buy-and-burn wallets (first burns 0x622efa3ad4dd7708c0866cb19632b45b5a14e5de1c4a7a296a235f4d784c580a and 0x1c34b12f590d45a68f76ef5ae8e7ed05a5744cde5533ccbdde1a456515aeb877), the first also bought July 2025, so its treasury delivery is left out above
const BUYBACK_WALLETS = ["0xf067b1741c8a81cf96214d3cde8d3f2b79a77ea0", "0x436de3bf8e6d9ee0cdc5159b5728e9870e73ef79"];

const AEVO_INTERNAL = new Set([DAO_TREASURY, DAO_TREASURY_2, ...BUYBACK_WALLETS]);

const fetch = async (options: FetchOptions) => {
  const bought = options.createBalances();
  await addTokensReceived({ options, balances: bought, token: AEVO, target: DAO_TREASURY, logFilter: (log: any) => TREASURY_BUYBACK_TXS.has(log.transactionHash.toLowerCase()) });
  await addTokensReceived({ options, balances: bought, token: AEVO, targets: BUYBACK_WALLETS, logFilter: (log: any) => !AEVO_INTERNAL.has(log.from) });
  return { dailyHoldersRevenue: bought.clone(1, METRIC.TOKEN_BUY_BACK) };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2024-08-01",
  methodology: {
    HoldersRevenue: "AEVO bought back on the open market by the Aevo DAO with USDC from Aevo's exchange balances, which AGP-2 funds from surplus protocol revenue (revenue left after the insurance fund and operating costs): the 2024 buyback program and the AGP-2 buybacks kept in the DAO treasury, and the AGP-3 monthly buyback and burn since February 2026. Excludes the one-off 69M AEVO burn of tokens the treasury already held, and the yearly share of liquidity-pool fees AGP-3 pays to AEVO stakers, which is not visible on Ethereum.",
  },
  breakdownMethodology: {
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: "AEVO valued at its price when it reaches Aevo: the six 2024 buybacks Aevo published and the May and June 2025 AGP-2 buybacks on delivery to the DAO treasury, plus the AEVO bought by the two buyback wallets for the July 2025 AGP-2 buyback and for every AGP-3 month, the latter burned right after purchase.",
    },
  },
};

export default adapter;
