import { aaveExport, AaveLendingPoolConfig, } from "../../helpers/aave";
import { CHAIN } from "../../helpers/chains";

const AaveMarkets: {[key: string]: Array<AaveLendingPoolConfig>} = {
  [CHAIN.ETHEREUM]: [
    {
      version: 1,
      lendingPoolProxy: '0x398eC7346DcD622eDc5ae82352F02bE94C62d119',
      dataProvider: '0x082B0cA59f2122c94E5F57Db0085907fa9584BA6',
    },
    {
      version: 2,
      lendingPoolProxy: '0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9',
      dataProvider: '0x057835ad21a177dbdd3090bb1cae03eacf78fc6d',
    },
    
    // core market
    {
      version: 3,
      lendingPoolProxy: '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2',
      dataProvider: '0x7b4eb56e7cd4b454ba8ff71e4518426369a138a3',
    },

    // lido market
    {
      version: 3,
      lendingPoolProxy: '0x4e033931ad43597d96d6bcc25c280717730b58b1',
      dataProvider: '0xa3206d66cf94aa1e93b21a9d8d409d6375309f4a',
    },

    // ether.fi market
    {
      version: 3,
      lendingPoolProxy: '0x0AA97c284e98396202b6A04024F5E2c65026F3c0',
      dataProvider: '0x8Cb4b66f7B13F2Ae4D3c91338fC007dbF8C14208',
    },
  ],
  [CHAIN.OPTIMISM]: [
    {
      version: 3,
      lendingPoolProxy: '0x794a61358d6845594f94dc1db02a252b5b4814ad',
      dataProvider: '0x69fa688f1dc47d4b5d8029d5a35fb7a548310654',
    },
  ],
  [CHAIN.ARBITRUM]: [
    {
      version: 3,
      lendingPoolProxy: '0x794a61358d6845594f94dc1db02a252b5b4814ad',
      dataProvider: '0x69fa688f1dc47d4b5d8029d5a35fb7a548310654',
    },
  ],
  [CHAIN.POLYGON]: [
    {
      version: 2,
      lendingPoolProxy: '0x8dff5e27ea6b7ac08ebfdf9eb090f32ee9a30fcf',
      dataProvider: '0x7551b5d2763519d4e37e8b81929d336de671d46d',
    },
    {
      version: 3,
      lendingPoolProxy: '0x794a61358d6845594f94dc1db02a252b5b4814ad',
      dataProvider: '0x69fa688f1dc47d4b5d8029d5a35fb7a548310654',
    },
  ],
  [CHAIN.AVAX]: [
    {
      version: 2,
      lendingPoolProxy: '0x4f01aed16d97e3ab5ab2b501154dc9bb0f1a5a2c',
      dataProvider: '0x65285e9dfab318f57051ab2b139cccf232945451',
    },
    {
      version: 3,
      lendingPoolProxy: '0x794a61358d6845594f94dc1db02a252b5b4814ad',
      dataProvider: '0x69fa688f1dc47d4b5d8029d5a35fb7a548310654',
    },
  ],
  [CHAIN.FANTOM]: [
    {
      version: 3,
      lendingPoolProxy: '0x794a61358d6845594f94dc1db02a252b5b4814ad',
      dataProvider: '0x69fa688f1dc47d4b5d8029d5a35fb7a548310654',
    },
  ],
  [CHAIN.BASE]: [
    {
      version: 3,
      lendingPoolProxy: '0xa238dd80c259a72e81d7e4664a9801593f98d1c5',
      dataProvider: '0x2d8a3c5677189723c4cb8873cfc9c8976fdf38ac',
    },
  ],
  [CHAIN.METIS]: [
    {
      version: 3,
      lendingPoolProxy: '0x90df02551bb792286e8d4f13e0e357b4bf1d6a57',
      dataProvider: '0x99411fc17ad1b56f49719e3850b2cdcc0f9bbfd8',
    },
  ],
  [CHAIN.XDAI]: [
    {
      version: 3,
      lendingPoolProxy: '0xb50201558b00496a145fe76f7424749556e326d8',
      dataProvider: '0x501b4c19dd9c2e06e94da7b6d5ed4dda013ec741',
    },
  ],
  [CHAIN.BSC]: [
    {
      version: 3,
      lendingPoolProxy: '0x6807dc923806fe8fd134338eabca509979a7e0cb',
      dataProvider: '0x41585c50524fb8c3899b43d7d797d9486aac94db',
    },
  ],
  [CHAIN.SCROLL]: [
    {
      version: 3,
      lendingPoolProxy: '0x11fCfe756c05AD438e312a7fd934381537D3cFfe',
      dataProvider: '0xa99F4E69acF23C6838DE90dD1B5c02EA928A53ee',
    },
  ],
  [CHAIN.ERA]: [
    {
      version: 3,
      lendingPoolProxy: '0x78e30497a3c7527d953c6B1E3541b021A98Ac43c',
      dataProvider: '0x48B96565291d1B23a014bb9f68E07F4B2bb3Cd6D',
    },
  ],
  [CHAIN.LINEA]: [
    {
      version: 3,
      lendingPoolProxy: '0xc47b8C00b0f69a36fa203Ffeac0334874574a8Ac',
      dataProvider: '0x2D97F8FA96886Fd923c065F5457F9DDd494e3877',
    },
  ],
  [CHAIN.SONIC]: [
    {
      version: 3,
      lendingPoolProxy: '0x5362dBb1e601abF3a4c14c22ffEdA64042E5eAA3',
      dataProvider: '0x306c124fFba5f2Bc0BcAf40D249cf19D492440b9',
    },
  ],
  [CHAIN.CELO]: [
    {
      version: 3,
      lendingPoolProxy: '0x3E59A31363E2ad014dcbc521c4a0d5757d9f3402',
      dataProvider: '0x33b7d355613110b4E842f5f7057Ccd36fb4cee28',
    },
  ],
}

export default aaveExport({ 
  [CHAIN.ETHEREUM]: AaveMarkets[CHAIN.ETHEREUM],
  [CHAIN.OPTIMISM]: AaveMarkets[CHAIN.OPTIMISM],
  [CHAIN.ARBITRUM]: AaveMarkets[CHAIN.ARBITRUM],
  [CHAIN.POLYGON]: AaveMarkets[CHAIN.POLYGON],
  [CHAIN.AVAX]: AaveMarkets[CHAIN.AVAX],
  [CHAIN.FANTOM]: AaveMarkets[CHAIN.FANTOM],
  [CHAIN.BASE]: AaveMarkets[CHAIN.BASE],
  [CHAIN.BSC]: AaveMarkets[CHAIN.BSC],
  [CHAIN.METIS]: AaveMarkets[CHAIN.METIS],
  [CHAIN.XDAI]: AaveMarkets[CHAIN.XDAI],
  [CHAIN.SCROLL]: AaveMarkets[CHAIN.SCROLL],
  [CHAIN.ERA]: AaveMarkets[CHAIN.ERA],
  [CHAIN.LINEA]: AaveMarkets[CHAIN.LINEA],
  [CHAIN.SONIC]: AaveMarkets[CHAIN.SONIC],
  [CHAIN.CELO]: AaveMarkets[CHAIN.CELO],
})
