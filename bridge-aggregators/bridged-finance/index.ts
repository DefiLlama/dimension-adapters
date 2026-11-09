import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const API_BASE = "https://bridged.finance/api/stats/volume";

/**
 * Bridged Finance Cross-Chain Routing & MetaRouter Gateway Contracts
 * Settled via Symbiosis protocol architecture across EVM networks.
 *
 * Supported Chains & MetaRouter Gateway Contracts:
 * - Ethereum:   0xB4769e9c5bE31199a25ecD1B0C6609183fa72521
 * - Arbitrum:   0x3743c756b64ECd0770f1d4f47696A73d2A46dcbe
 * - Base:       0xa18348e793E77239EC68CAa51b74c5Cdc82c8a9d
 * - BSC:        0x851B43189de721dD94AbA767AAd9E6F6d6a95CCA
 * - Polygon:    0x2eE9559387b806E88fd46b9DA160D64A29CE7Da0
 * - Optimism:   0xA9A96Ee51dD54B9f51d46b1fbD2A19c1295Ec75b
 * - Avalanche:  0xfeC09BE39F82b13471D2e0E7d72e6ee589c631c6
 * - Linea:      0xEbD15fCa7aB58470C40653ecB60f10fa08322F67
 * - Scroll:     0x3338BE49A5f60e2593337919F9aD7098e9a7Dd7E
 * - ZKsync Era: 0x87d4007a8a7e4897AB00a5390dAaF0b8bE199C84
 */

const fetch = async (options: FetchOptions) => {
  const { dateString, chain } = options;
  const res = await fetchURL(`${API_BASE}?day=${dateString}&chain=${chain}`);
  const dailyBridgeVolume = res.dailyBridgeVolume ?? res.volume;
  if (dailyBridgeVolume === undefined || dailyBridgeVolume === null) {
    throw new Error(`Failed to retrieve volume for ${chain} on ${dateString}`);
  }
  return {
    dailyBridgeVolume: Number(dailyBridgeVolume),
  };
};

const adapter: SimpleAdapter = {
  version: 1, // endpoint aggregates by UTC day
  fetch,
  chains: [
    CHAIN.ETHEREUM,
    CHAIN.ARBITRUM,
    CHAIN.BASE,
    CHAIN.BSC,
    CHAIN.POLYGON,
    CHAIN.OPTIMISM,
    CHAIN.AVAX,
    CHAIN.SOLANA,
    CHAIN.LINEA,
    CHAIN.SCROLL,
    CHAIN.ZKSYNC,
  ],
  start: "2023-06-15",
  doublecounted: true,
  methodology: {
    BridgeVolume:
      "USD value of cross-chain swaps and bridge transfers initiated through Bridged Finance interface across supported networks, verified and indexed on-chain.",
  },
};

export default adapter;
