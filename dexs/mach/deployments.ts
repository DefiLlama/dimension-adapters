import { CHAIN } from "../../helpers/chains";

type Deployment = {
    address: string,
    start: string,
}

const DEPLOYMENTS: { [chain: string]: Deployment } = {
    [CHAIN.ETHEREUM]: {
        address: "0x5d8bca5F0b3D9c9513a75D0206dAF0b4FF8bda95",
        start: "2024-07-13T18:05:35.000Z",
    },
  
    [CHAIN.OPTIMISM]: {
        address: "0xE0CAAeaCa771691A73B5a0846DF8aB40b6Aed5df",
        start: "2024-07-02T05:47:41.000Z",
    },

    [CHAIN.ARBITRUM]: {
        address: "0xa40Ad3916237fa0FE11A500241fFA6eAc59CBD6A",
        start: "2024-07-02T05:48:05.000Z",
    },

    [CHAIN.AVAX]: {
        address: "0xeFad3dA107eBe51aFBEe197725b4B5720Bf58cfC",
        start: "2024-07-02T20:29:26.000Z",
    },

    [CHAIN.POLYGON]: {
        address: "0xC4b8debe12b0A28eBe92fF0F0e8024D28407B846",
        start: "2024-07-02T20:29:55.000Z",
    },

    [CHAIN.BASE]: {
        address: "0x35123fc9a8A4657a19FE3d48a88bCBd295FF196E",
        start: "2024-07-02T20:27:25.000Z",
    },

    [CHAIN.CELO]: {
        address: "0x723510043Ad5d3B92BC6652D3E2da869076Deaf5",
        start: "2024-07-02T20:31:11.000Z",
    },

    [CHAIN.BSC]: {
        address: "0xB6A80EfAAB1d5CC7fC337b9924ef218547F6E9B8",
        start: "2024-07-02T20:30:31.000Z",
    },

    [CHAIN.OP_BNB]: {
        address: "0xD4B8eA768327DAFcEf27145A1280e32e7a959992",
        start: 	"2024-07-09T05:44:39.000Z",
    },

    [CHAIN.MANTLE]: {
        address: "0xD4B8eA768327DAFcEf27145A1280e32e7a959992",
        start: "2024-07-09T13:59:42.000Z",
    },

    [CHAIN.SCROLL]: {
        address: "0xCd6f2bb0e299D8dc9ec5e2D3D2C94fa1e637b1a6",
        start: "2024-07-09T05:39:36.000Z",
    },

    [CHAIN.MODE]: {
        address: "0xD4B8eA768327DAFcEf27145A1280e32e7a959992",
        start: "2024-07-09T05:58:19.000Z",
    },

    [CHAIN.BLAST]: {
        address: "0xCd6f2bb0e299D8dc9ec5e2D3D2C94fa1e637b1a6",
        start: "2024-07-02T20:26:59.000Z",
    }
}

export { DEPLOYMENTS };

