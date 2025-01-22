import { Chain } from "@defillama/sdk/build/types";
import {
  FetchOptions,
  FetchResultVolume,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

type IContract = {
  [c: string | Chain]: string;
};

const router: IContract = {
  [CHAIN.AURORA]: "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae",
  [CHAIN.ARBITRUM]: "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae",
  [CHAIN.OPTIMISM]: "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae",
  [CHAIN.BASE]: "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae",
  [CHAIN.ETHEREUM]: "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae",
  [CHAIN.AVAX]: "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae",
  [CHAIN.BSC]: "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae",
  [CHAIN.LINEA]: "0xde1e598b81620773454588b85d6b5d4eec32573e",
  [CHAIN.MANTLE]: "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae",
  [CHAIN.POLYGON]: "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae",
  [CHAIN.POLYGON_ZKEVM]: "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae",
  [CHAIN.FANTOM]: "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae",
  [CHAIN.MODE]: "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae",
  [CHAIN.SCROLL]: "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae",
  [CHAIN.ERA]: "0x341e94069f53234fe6dabef707ad424830525715",
  [CHAIN.METIS]: "0x24ca98fb6972f5ee05f0db00595c7f68d9fafd68",
  [CHAIN.XDAI]: "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae",
  [CHAIN.TAIKO]: "0x3a9a5dba8fe1c4da98187ce4755701bca182f63b",
  [CHAIN.BLAST]: "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae",
  [CHAIN.BOBA]: "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae",
  [CHAIN.FUSE]: "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae",
  [CHAIN.CRONOS]: "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae",
  [CHAIN.GRAVITY]: "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae",
  // [CHAIN.SEI]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  // [CHAIN.ROOTSTOCK]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
};

const collector: IContract = {
  [CHAIN.AURORA]: "0xB0210dE78E28e2633Ca200609D9f528c13c26cD9",
  [CHAIN.ARBITRUM]: "0xB0210dE78E28e2633Ca200609D9f528c13c26cD9",
  [CHAIN.OPTIMISM]: "0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9",
  [CHAIN.BASE]: "0x0A6d96E7f4D7b96CFE42185DF61E64d255c12DFf",
  [CHAIN.ETHEREUM]: "0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9",
  [CHAIN.AVAX]: "0xB0210dE78E28e2633Ca200609D9f528c13c26cD9",
  [CHAIN.BSC]: "0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9",
  [CHAIN.LINEA]: "0xA4A24BdD4608D7dFC496950850f9763B674F0DB2",
  [CHAIN.MANTLE]: "0xF048e5816B0C7951AC179f656C5B86e5a79Bd7b5",
  [CHAIN.POLYGON]: "0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9",
  [CHAIN.POLYGON_ZKEVM]: "0xB49EaD76FE09967D7CA0dbCeF3C3A06eb3Aa0cB4",
  [CHAIN.FANTOM]: "0xB0210dE78E28e2633Ca200609D9f528c13c26cD9",
  [CHAIN.MODE]: "0xF048e5816B0C7951AC179f656C5B86e5a79Bd7b5",
  [CHAIN.SCROLL]: "0xF048e5816B0C7951AC179f656C5B86e5a79Bd7b5",
  [CHAIN.ERA]: "0x8dBf6f59187b2EB36B980F3D8F4cFC6DC4E4642e",
  [CHAIN.METIS]: "0x27f0e36dE6B1BA8232f6c2e87E00A50731048C6B",
  [CHAIN.XDAI]: "0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9",
  [CHAIN.TAIKO]: "0xDd8A081efC90DFFD79940948a1528C51793C4B03",
  [CHAIN.BLAST]: "0xF048e5816B0C7951AC179f656C5B86e5a79Bd7b5",
  [CHAIN.BOBA]: "0xB0210dE78E28e2633Ca200609D9f528c13c26cD9",
  [CHAIN.FUSE]: "0xB0210dE78E28e2633Ca200609D9f528c13c26cD9",
  [CHAIN.CRONOS]: "0x11d40Dc8Ff0CE92F54A315aD8e674a55a866cBEe",
  [CHAIN.GRAVITY]: "0x79540403cdE176Ca5f1fb95bE84A7ec91fFDEF76",
  // [CHAIN.SEI]: '0x7956280Ec4B4d651C4083Ca737a1fa808b5319D8',
  // [CHAIN.ROOTSTOCK]: '0xF048e5816B0C7951AC179f656C5B86e5a79Bd7b5',
  [CHAIN.CELO]: "0xF048e5816B0C7951AC179f656C5B86e5a79Bd7b5",
  [CHAIN.EVMOS]: "0xB49EaD76FE09967D7CA0dbCeF3C3A06eb3Aa0cB4",
  [CHAIN.FRAXTAL]: "0x7956280Ec4B4d651C4083Ca737a1fa808b5319D8",
  [CHAIN.HARMONY]: "0xB0210dE78E28e2633Ca200609D9f528c13c26cD9",
  [CHAIN.IMMUTABLEX]: "0x1a4E99aB56BBac95810C0A957F173054f6FA8fDc",
  [CHAIN.LISK]: "0x50D5a8aCFAe13Dceb217E9a071F6c6Bd5bDB4155",
  [CHAIN.MOONBEAM]: "0xB0210dE78E28e2633Ca200609D9f528c13c26cD9",
  [CHAIN.MOONRIVER]: "0xB0210dE78E28e2633Ca200609D9f528c13c26cD9",
  [CHAIN.ARBITRUM_NOVA]: "0xB0210dE78E28e2633Ca200609D9f528c13c26cD9",
  [CHAIN.OKEXCHAIN]: "0xB0210dE78E28e2633Ca200609D9f528c13c26cD9",
  [CHAIN.OP_BNB]: "0x6A2420650139854F17964b8C3Bb60248470aB57E",
  [CHAIN.SONIC]: "0xaFb8cC8fCd71cd768Ce117C11eB723119FCDb1f8",
  [CHAIN.VELAS]: "0xB0210dE78E28e2633Ca200609D9f528c13c26cD9",
  [CHAIN.XLAYER]: "0xC69994fd72824ca98F8a0B1E2ABc954E65a91cf4",
};

const fetch: any = async (
  timestamp: number,
  _,
  options: FetchOptions,
): Promise<FetchResultVolume> => {
  const dailyVolume = options.createBalances();
  const data: any[] = await options.getLogs({
    target: router[options.chain],
    topic: "0xcba69f43792f9f399347222505213b55af8e0b0b54b893085c2e27ecbe1644f1",
  });
  data.forEach((e: any) => {
    const data = e.data.replace("0x", "");
    const integrator = "0x" + data.slice(3 * 64, 4 * 64);
    if (
      "0x0000000000000000000000000000000000000000000000000000000000000180" ===
      integrator
    ) {
      const sendingAssetId = data.slice(5 * 64, 6 * 64);
      const contract_address =
        "0x" + sendingAssetId.slice(24, sendingAssetId.length);
      const minAmount = Number("0x" + data.slice(7 * 64, 8 * 64));
      dailyVolume.add(contract_address, minAmount);
    }
  });

  const dailyFees =
    options.chain in collector
      ? await addTokensReceived({
          options,
          target: collector[options.chain],
        })
      : undefined;

  return { dailyBridgeVolume: dailyVolume, timestamp, dailyFees } as any;
};

const adapter: SimpleAdapter = {
  adapter: Object.keys(router).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: { fetch, start: "2023-08-10" },
    };
  }, {}),
};

export default adapter;
