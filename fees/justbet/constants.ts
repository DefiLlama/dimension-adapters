export const WINR_VAULT_ADAPTER_CONTRACT =
  "0xc942b79E51fe075c9D8d2c7501A596b4430b9Dd7";

export const JUSTBET_BANKROLL_INDEXES = [
  "0x0000000000000000000000000000000000000001",
  "0x0000000000000000000000000000000000000006",
  "0x0000000000000000000000000000000000000013",
  "0x0000000000000000000000000000000000000014",
  "0x0000000000000000000000000000000000000015",
  "0x0000000000000000000000000000000000000019",
];

export const TOKEN_DETAILS = {
  "0xd77b108d4f6cefaa0cae9506a934e825becca46e": {
    coingeckoId: "winr-protocol",
    decimals: 18,
  }, // WINR on arbitrum
  "0xbf6fa9d2bf9f681e7b6521b49cf8eccf9ad8d31d": {
    coingeckoId: "winr-protocol",
    decimals: 18,
  }, // WWINR on winr chain
  "0x59edbb343991d30f77dcdbad94003777e9b09ba9": {
    coingeckoId: "usd-coin",
    decimals: 6,
  }, // USDC on winr chain
  "0x0381132632e9e27a8f37f1bc56bd5a62d21a382b": {
    coingeckoId: "tether",
    decimals: 6,
  }, // Tether on winr chain
  "0xf2857668777135e22f8cd53c97abf8821b7f0bdf": {
    coingeckoId: "arbitrum",
    decimals: 18,
  }, // Arbitrum on winr chain
  "0xe60256921ae414d7b35d6e881e47931f45e027cf": {
    coingeckoId: "ethereum",
    decimals: 18,
  }, // Ether on winr chain
  "0x5b20dcab6b91f157a39036c6c0e6f16e56d74cdb": {
    coingeckoId: "solana",
    decimals: 18,
  }, // Solana on winr chain
};
