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
    id: "2626", // ether.fi Stake
    chain: CHAIN.ETHEREUM,
    token: "0x35fA164735182de50811E8e2E824cFb9B6118ac2", // eETH, the stake receipt; weETH only wraps it
    // Withdrawals park eETH here and burn later on claim.
    exitAddresses: ["0x7d5706f6ef3F89B3951E23e557CDFBC3239D4E2c"], // Withdraw Request NFT
    start: "2023-11-16",
  },
  {
    id: "900", // Rocket Pool
    chain: CHAIN.ETHEREUM,
    token: "0xae78736Cd615f374D3085123A210448E74Fc6393", // rETH, burns straight to zero on redeem
    start: "2021-10-07",
  },
  {
    id: "4133", // Ethena USDe
    chain: CHAIN.ETHEREUM,
    token: "0x9D39A5DE30e57443BfF2A8307A4256c8797A3497",
    start: "2023-11-21",
  },
  {
    id: "6790", // Falcon Finance
    chain: CHAIN.ETHEREUM,
    token: "0xc8CF6D7991f15525488b2A83Df53468D682Ba4B0",
    start: "2025-02-12",
  },
  {
    id: "3946", // Kelp
    chain: CHAIN.ETHEREUM,
    token: "0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7", // rsETH
    // Every rsETH exit goes here and none burns to zero; without it the adapter
    // saw 10 users in a week where the protocol saw 50.
    exitAddresses: ["0x62De59c08eB5dAE4b7E6F7a8cAd3006d6965ec16"], // LRTWithdrawalManager
    start: "2023-12-06",
  },
];

export default tokenUsers.map((config) => ({
  id: config.id,
  adapter: alliumTokenUsersExport(config),
}));
