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