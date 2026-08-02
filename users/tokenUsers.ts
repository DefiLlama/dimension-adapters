import { CHAIN } from "../helpers/chains";
import { alliumTokenUsersExport } from "./utils/alliumUsers";

const tokenUsers = [
  {
    id: "182", // Lido
    chain: CHAIN.ETHEREUM,
    token: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84", // stETH
    // The protocol burns stETH on finalisation, so the exit is the queue transfer.
    exitAddresses: ["0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1"], // unstETH withdrawal queue
    start: "2020-12-18",
  },
  {
    id: "2914", // Binance staked ETH
    chain: CHAIN.ETHEREUM,
    token: "0xa2E3356610840701BDf5611a53974510Ae27E2e1", // wBETH
    start: "2023-04-26",
  },
  {
    id: "2626", // ether.fi Stake
    chain: CHAIN.ETHEREUM,
    token: "0x35fA164735182de50811E8e2E824cFb9B6118ac2", // eETH, the stake receipt; weETH only wraps it
    start: "2023-11-16",
  },
  {
    id: "900", // Rocket Pool
    chain: CHAIN.ETHEREUM,
    token: "0xae78736Cd615f374D3085123A210448E74Fc6393", // rETH
    start: "2021-10-07",
  },
  {
    id: "3946", // Kelp
    chain: CHAIN.ETHEREUM,
    token: "0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7", // rsETH
    start: "2023-12-06",
  },
  {
    id: "277", // StakeWise V2
    chain: CHAIN.ETHEREUM,
    token: "0xf1C9acDc66974dFB6dEcB12aA385b9cD01190E38", // osETH
    start: "2023-11-01",
  },
];

export default tokenUsers.map((config) => ({
  id: config.id,
  adapter: alliumTokenUsersExport(config),
}));
