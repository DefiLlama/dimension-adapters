import { CuratorConfig, getCuratorExport } from "../helpers/curators";

// KPK's Morpho vaults
const curatorConfig: CuratorConfig = {
  vaults: {
    ethereum: {
      morpho: [
        "0xe108fbc04852B5df72f9E44d7C29F47e7A993aDd", //Morpho USDC Prime
        "0x0c6aec603d48eBf1cECc7b247a2c3DA08b398DC1", //Morpho EURC Yield
        "0xd564F765F9aD3E7d2d6cA782100795a885e8e7C8", //Morpho ETH Prime
        "0x4Ef53d2cAa51C447fdFEEedee8F07FD1962C9ee6", //Morpho v2 USDC
        "0xa877D5bb0274dcCbA8556154A30E1Ca4021a275f", //Morpho v2 EURC
        "0xbb50a5341368751024ddf33385ba8cf61fe65ff9", //Morpho v2 ETH
      ],
    },
    arbitrum: {
      morpho: [
        "0x2C609d9CfC9dda2dB5C128B2a665D921ec53579d", //Morpho USDC Yield
      ],
    },
  }
}


export default getCuratorExport(curatorConfig);
