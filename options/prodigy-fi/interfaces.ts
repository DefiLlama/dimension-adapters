import { CHAIN } from "../../helpers/chains";

export type BlockRange = { fromBlock: number; toBlock: number };

export type VaultMetadata = {
  token: string;
  quantity: bigint;
  yieldValue: bigint;
};

export type ChainConfig = {
  factory: string;
  v1StartBlock: number;
  v1_1StartBlock: number;
  v2StartBlock: number;
  start: string;
};

export type VaultQuery =
  | { kind: "v2"; logs: Promise<any[]> }
  | { kind: "v1_1"; logs: Promise<any[]> }
  | { kind: "v1"; logs: Promise<any[]> };

export const v2Deposit = `event VaultCreated(address indexed,address indexed,address indexed,address vaultAddress,tuple(address,address,address linkedToken,address investmentToken,address,bytes32,uint256,uint256 linkedPrice,int256,uint256 yieldValue,bool isBuyLow,uint256 quantity,uint256,uint64,address,uint256,address,int256,address) vaultParams,uint8)`;
export const v1_1Deposit = `event VaultCreated(address indexed,address indexed,address indexed,address vaultAddress,tuple(address,address,address linkedToken,address investmentToken,address,bytes32,uint256,uint256 linkedPrice,int256,uint256 yieldValue,bool isBuyLow,uint256 quantity,uint256,uint64,address,uint256,address,int256) vaultParams)`;
export const v1Deposit = `event VaultCreated(address indexed,address indexed baseToken,address indexed quoteToken,address vaultAddress,uint256,uint256 linkedPrice,int256,uint256 yieldValue,bool isBuyLow,uint256 quantity,uint256,uint256,uint256,int256)`;

export const config: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: {
    factory: "0xAC2a612C49f29e26858Df1a53f7623180bcc3753",
    v1StartBlock: 23831175,
    v1_1StartBlock: 23831175,
    v2StartBlock: 24036992,
    start: "2025-11-19"
  },
  [CHAIN.BASE]: {
    factory: "0xFE198B51cfb1F96b56c63fe323a934BEAAA3b281",
    v1StartBlock: 22133150,
    v1_1StartBlock: 30509116,
    v2StartBlock: 39795788,
    start: "2024-11-08"
  },
  [CHAIN.BERACHAIN]: {
    factory: "0x29ca87b2f744127606ada4564da8219be6498ca1",
    v1StartBlock: 804138,
    v1_1StartBlock: 5297670,
    v2StartBlock: 14682550,
    start: "2025-02-07"
  },
};
