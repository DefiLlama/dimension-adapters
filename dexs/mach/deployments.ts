import { CHAIN } from "../../helpers/chains";

type Deployment = {
    address?: string,   // Order Book
    v2Address?: string, // Order Book V2
    start: string,
}

// https://docs2.mach.exchange/mach/protocol-concepts/contract-addresses
const DEPLOYMENTS: { [chain: string]: Deployment } = {
    [CHAIN.ETHEREUM]: {
        address: "0x5d8bca5F0b3D9c9513a75D0206dAF0b4FF8bda95",
        v2Address: "0x137092D65b9f4861C7Fc2B58cd7Fd52aA0ADFEb0",
        start: "2024-07-13",
    },
  
    [CHAIN.OPTIMISM]: {
        address: "0xE0CAAeaCa771691A73B5a0846DF8aB40b6Aed5df",
        v2Address: "0x5861b75321c3f9CD25BaF61CCE59f87C77b33F90",
        start: "2024-07-02",
    },

    [CHAIN.ARBITRUM]: {
        address: "0xa40Ad3916237fa0FE11A500241fFA6eAc59CBD6A",
        v2Address: "0xd8b8B056cE030b32d6C5198Ae1d14952a56A0458",
        start: "2024-07-02",
    },

    [CHAIN.AVAX]: {
        address: "0xeFad3dA107eBe51aFBEe197725b4B5720Bf58cfC",
        v2Address: "0xD98ad5D97982C7C2cd55Dc89B96DF9fB67631D77",
        start: "2024-07-02",
    },

    [CHAIN.POLYGON]: {
        address: "0xC4b8debe12b0A28eBe92fF0F0e8024D28407B846",
        v2Address: "0x3Ceedd8F86dcf54D0A34EEF0e933c70fc3A7e958",
        start: "2024-07-02",
    },

    [CHAIN.BASE]: {
        address: "0x35123fc9a8A4657a19FE3d48a88bCBd295FF196E",
        v2Address: "0x026A0145Ca797737B773A4745ebb9CbE9DAe4802",
        start: "2024-07-02",
    },

    [CHAIN.CELO]: {
        address: "0x723510043Ad5d3B92BC6652D3E2da869076Deaf5",
        start: "2024-07-02",
    },

    [CHAIN.BSC]: {
        address: "0xB6A80EfAAB1d5CC7fC337b9924ef218547F6E9B8",
        v2Address: "0xC60461f8770dAa36663057ec46F7d46D77AA9501",
        start: "2024-07-02",
    },

    [CHAIN.OP_BNB]: {
        address: "0xD4B8eA768327DAFcEf27145A1280e32e7a959992",
        start: 	"2024-07-09",
    },

    [CHAIN.MANTLE]: {
        address: "0xD4B8eA768327DAFcEf27145A1280e32e7a959992",
        start: "2024-07-09",
    },

    [CHAIN.SCROLL]: {
        address: "0xCd6f2bb0e299D8dc9ec5e2D3D2C94fa1e637b1a6",
        start: "2024-07-09",
    },

    [CHAIN.MODE]: {
        address: "0xD4B8eA768327DAFcEf27145A1280e32e7a959992",
        start: "2024-07-09",
    },

    [CHAIN.BLAST]: {
        address: "0xCd6f2bb0e299D8dc9ec5e2D3D2C94fa1e637b1a6",
        start: "2024-07-02",
    },

    [CHAIN.UNICHAIN]: {
        v2Address: "0x6D32b45F25B4B2386C50F6505999b34D962944A7",
        start: "2025-02-12",
    },
}

export { DEPLOYMENTS };

