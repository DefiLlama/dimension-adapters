import { countUsers, isAddressesUsable } from "../utils/countUsers";
import * as sdk from "@defillama/sdk";
import { ChainAddresses } from "../utils/types";

const comptrollers = [
    {
        name: "compound v2",
        id: "114",
        comptrollers: {
            "ethereum": ["0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B"]
        }
    },
    {
        "id":"parent#apeswap",
        "name":"ApeSwap",
        comptrollers: {
            "bsc":[
                "0xad48b2c9dc6709a560018c678e918253a65df86e",//unitroller
            ],
        },
        "extraAddresses":{
            "ethereum":[
                "0x5f509a3C3F16dF2Fba7bF84dEE1eFbce6BB85587"
            ],
            "polygon":[
                "0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7"
            ],
            "bsc":[
                "0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7",
            ],
            "arbitrum":[
                "0x7d13268144adcdbEBDf94F654085CC15502849Ff"
            ],
            "telos":[
                "0xb9667Cf9A495A123b0C43B924f6c2244f42817BE"
            ]
        }
    },
    {
        id: "212",
        name: "Venus",
        comptrollers:{
            "bsc":[
                "0xfD36E2c2a6789Db23113685031d7F16329158384",
            ]
        }
    },
    {
        id: "121",
        name: "CREAM Finance",
        comptrollers:{
            "polygon":[
                "0x20ca53e2395fa571798623f1cfbd11fe2c114c24",
            ],
            "arbitrum":[
                "0xbadaC56c9aca307079e8B8FC699987AAc89813ee"
            ],
            "ethereum":[
                "0xAB1c342C7bf5Ec5F02ADEA1c2270670bCa144CbB",
                "0x5eF4c9384D9d7C39CBC12B62e82900042F1205B4"
            ],
            "bsc":[
                "0x589DE0F0Ccf905477646599bb3E5C622C84cC0BA"
            ]
        }
    },
    {
        id: "2142",
        name: "Sonne Finance",
        comptrollers:{
            "optimism":[
                "0x60CF091cD3f50420d50fD7f707414d0DF4751C58",
            ]
        }
    },
    {
        id: "2537",
        name: "Flux Finance",
        comptrollers:{
            "ethereum":[
                "0x95Af143a021DF745bc78e845b54591C53a8B3A51",
            ]
        }
    },
    {
        id: "573",
        name: "Liqee",
        comptrollers:{
            "ethereum":[
                "0x8f1f15DCf4c70873fAF1707973f6029DEc4164b3",
            ],
            "bsc":[
                "0x6d290f45A280A688Ff58d095de480364069af110"
            ]
        }
    },
    {
        id: "1303",
        name: "Iron Bank",
        comptrollers:{
            "ethereum":[
                "0xAB1c342C7bf5Ec5F02ADEA1c2270670bCa144CbB",
            ],
            "fantom":[
                "0x4250a6d3bd57455d7c6821eecb6206f507576cd2",
            ],
            "avax":[
                "0x2eE80614Ccbc5e28654324a66A396458Fa5cD7Cc",
            ]
        }
    },
    {
        id: "589",
        name: "Strike",
        comptrollers:{
            "ethereum":[
                "0xe2e17b2CBbf48211FA7eB8A875360e5e39bA2602",
            ]
        }
    },
    {
        id: "2339",
        name: "Lodestar Finance",
        comptrollers:{
            "arbitrum":[
                "0x92a62f8c4750D7FbDf9ee1dB268D18169235117B",
            ]
        }
    },
    {
        id: "450",
        name: "Scream",
        comptrollers:{
            "fantom":[
                "0x260e596dabe3afc463e75b6cc05d8c46acacfb09",
            ]
        }
    },
    {
        id: "1631",
        name: "Onyx Protocol",
        comptrollers:{
            "ethereum":[
                "0x7D61ed92a6778f5ABf5c94085739f1EDAbec2800",
            ]
        }
    },
    {
        id: "1614",
        name: "0vix",
        comptrollers:{
            "polygon":[
                "0x8849f1a0cB6b5D6076aB150546EddEe193754F1C",
            ],
            "polygon_zkevm":[
                "0x6EA32f626e3A5c41547235ebBdf861526e11f482",
            ],
        }
    },
    {
        id: "2382",
        name: "Tender Finance",
        comptrollers:{
            "arbitrum":[
                "0xeed247Ba513A8D6f78BE9318399f5eD1a4808F8e"
            ]
        }
    },
    {
        id:"2761",
        name:"Hector Lending",
        comptrollers:{
            "fantom":[
                "0x56644FA0fCfA09b2a04F659E499847611A8AD176",//unitroller
            ]
        }
    },
    {
        id:"136",
        name:"Rari Capital",
        comptrollers:{
        "ethereum":[
            "0xD9F223A36C2e398B0886F945a7e556B41EF91A3C",//unitroller
            "0x6afE6C37bF75f80D512b9D89C19EC0B346b09a8d",//unitroller
            "0x369855b051D1b2dBee88a792DCFc08614ff4e262",//unitroller
            "0xa422890cbBE5EAa8f1c88590fBab7F319D7e24B6",//unitroller
            "0xb42Bc0A99A176a16DE9aF1A490CaE0C6832b43b8",//unitroller
            "0xdac4585B741E5b6625CEc460D2A255fB3FBE0D47",//unitroller
            "0x3f4931a8e9d4cdf8f56e7e8a8cfe3bede0e43657",//unitroller
        ],
        "arbitrum":[
            "0xC7D021BD813F3b4BB801A4361Fbcf3703ed61716"
        ]
    }
    },
    {
        id:"338",
        name:"Inverse Finance Frontier",
        comptrollers:{
            "ethereum":[
                "0x4dcf7407ae5c07f8681e1659f626e114a7667339",//unitroller
            ]
        }
    },
    {
        id:"parent#benqi",
        name:"Benqi",
        comptrollers:{
            "avax":[
                "0x486Af39519B4Dc9a7fCcd318217352830E8AD9b4",//unitroller
            ]
        }
    },
    {
        id:"parent#trader-joe",
        name:"Trader Joe",
        comptrollers:{
            "avax":[
                "0xdc13687554205E5b89Ac783db14bb5bba4A1eDaC",//unitroller
            ],
        },
        "extraAddresses":{
            "arbitrum":[
                "0x7BFd7192E76D950832c77BB412aaE841049D8D9B"
            ],
            "avax":[
                "0xE3Ffc583dC176575eEA7FD9dF2A7c65F7E23f4C3"
            ],
            "bsc":[
                "0xb66A2704a0dabC1660941628BE987B4418f7a9E8"
            ]
        }
    },

]

function findAllAddresses(comptrollers:any, extraAddresses:any): ()=>Promise<ChainAddresses>{
    return async()=> {
        const allChainAddresses = extraAddresses ?? {};
        await Promise.all(Object.entries(comptrollers).map(async ([chain, addressList]:[string, any])=>{
            const extra = allChainAddresses?.[chain] ?? []
            const allAddresses = (await Promise.all(addressList.map((address:string) => sdk.api2.abi.call({
                target: address,
                params: [],
                abi: 'address[]:getAllMarkets',
                chain
            })))).flat().concat(addressList, extra);
            allChainAddresses[chain] = allAddresses;
        }))
        return allChainAddresses
    }
}

export const addresses = comptrollers.map(addresses=>({
    name: addresses.name,
    id: addresses.id,
    getAddresses: findAllAddresses(addresses.comptrollers, addresses.extraAddresses)
}))

export default addresses.map(addresses=>({
    name: addresses.name,
    id: addresses.id,
    getUsers: async (start:number, end:number) => countUsers(await addresses.getAddresses())(start, end)
}))