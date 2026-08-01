import ADDRESSES from '../../helpers/coreAssets.json'
export const WINR_VAULT_ADAPTER_CONTRACT =
  "0xc942b79E51fe075c9D8d2c7501A596b4430b9Dd7";

export const JUSTBET_BANKROLL_INDEXES = [
  ADDRESSES.linea.WETH_1,
  "0x0000000000000000000000000000000000000006",
  "0x0000000000000000000000000000000000000013",
  "0x0000000000000000000000000000000000000014",
  "0x0000000000000000000000000000000000000015",
  "0x0000000000000000000000000000000000000019",
];

export const TOKEN_DETAILS = {
  [ADDRESSES.winr.WINR]: {
    coingeckoId: "winr-protocol",
    decimals: 18,
  }, // WINR on arbitrum
  [ADDRESSES.winr.WINR_1]: {
    coingeckoId: "winr-protocol",
    decimals: 18,
  }, // WWINR on winr chain
  [ADDRESSES.winr.USDC]: {
    coingeckoId: "usd-coin",
    decimals: 6,
  }, // USDC on winr chain
  [ADDRESSES.winr.USDT]: {
    coingeckoId: "tether",
    decimals: 6,
  }, // Tether on winr chain
  [ADDRESSES.winr.ARB]: {
    coingeckoId: "arbitrum",
    decimals: 18,
  }, // Arbitrum on winr chain
  [ADDRESSES.winr.ETH]: {
    coingeckoId: "ethereum",
    decimals: 18,
  }, // Ether on winr chain
  [ADDRESSES.winr.SOL]: {
    coingeckoId: "solana",
    decimals: 18,
  }, // Solana on winr chain
};
