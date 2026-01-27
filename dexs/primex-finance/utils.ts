import { CHAIN } from "../../helpers/chains";

interface ChainConfig {
  swapManager: string[];
  positionManager: string[];
  batchManager: string[];
  start: number;
}

const config: { [chain: string]: ChainConfig } = {
  [CHAIN.POLYGON]: {
    swapManager: [
      "0x0AaDC2Eae6963ED983d85cbF088b0c294f4c26ff",
      "0x140D437ac247D8D8FC43534f8f4E6c555B257a9e",
      "0xA0069a14Df3ECd19a38c509757eBc2C2Aaa44992",
    ],
    positionManager: ["0x02bcaA4633E466d151b34112608f60A82a4F6035"],
    batchManager: [
      "0xC6B1AF3dEb9E379ccADF2Fa21263a50E91F4776C",
      "0xc611c8c3689B67096180289643Bd086ae5833ADC",
      "0xc10771D8f5B6Ba702E3a44EC76969f07578F08b7",
    ],
    start: '2023-10-18',
  },
  [CHAIN.ARBITRUM]: {
    swapManager: [
      "0xbE3de856EB22bf6EFA03DD55e65DF22bA212e6Db",
      "0xC024DE24f34eEc431D41340DA5A18d67eE46BA79",
    ],
    positionManager: ["0x86890E30cE9E1e13Db5560BbEb435c55567Af1cd"],
    batchManager: [
      "0xF2225a8f90311DaF9e989db1AfFd47617bb69E96",
      "0xE81ed447d923153f51207fdc41973B204F085f21",
    ],
    start: '2023-11-22',
  },
  [CHAIN.ETHEREUM]: {
    swapManager: [
      "0xa6d76535e265357187653d4AAd9b362404D42EA8",
      "0xb980D7b0F4A05572DE635E8916A222F05fC64552",
    ],
    positionManager: ["0x99d63fEA4b3Ef6ca77941df3C5740dAd1586f0B8"],
    batchManager: [
      "0x1da9c104C517C7b4465c8Eef458Da0a6c61835Fe",
      "0x2ff2D294312D3224d609fCc0b2EeE82b5f665753",
    ],
    start: '2023-12-17',
  },
  [CHAIN.BASE]: {
    swapManager: ["0xFFdf60c0f83be68C906fb5B8c481A719845bb0a0"],
    positionManager: ["0x01ED183275956dBd0064B789B778cA0921e695E9"],
    batchManager: ["0x09641d48cF6644c9059004bA8605a76C6334700A",],
    start: "2024-12-06",
  },
};
const topics = {
  swap: "0x5fcf6637f014854f918b233372226c5492e6a5157e517674a8588675550c40c6",
  openPosition:
    "0x3f505465ce78d219c28bcf9bed881a651c4800d1161454b0d5c93225196e7b8e",
  openPositionV2:
    "0x7eb8abd0eb2f629d9150adef2d047584ab0d0830368a1d5d5243955f73f884e7",
  partiallyClosePosition:
    "0xda47f84a849dfb28125ae28a0bf305b75e72bff27796fc4bca36e2f848b0a0e6",
  closePosition:
    "0x4a06c6510972c5a49ff5582d7d8e59f20228038c8cb9ea05d78f02ac7ee40662",
};

export { config, topics };
