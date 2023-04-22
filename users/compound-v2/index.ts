import { countUsers, isAddressesUsable } from "../utils/countUsers";
import * as sdk from "@defillama/sdk";
import { ChainAddresses } from "../utils/types";

const comptrollers = [
    {
        name: "compound v2",
        id: "114",
        addresses: {
            "ethereum": ["0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B"]
        }
    }
]

function findAllAddresses(addresses:any): ()=>Promise<ChainAddresses>{
    return async()=> Object.fromEntries(await Promise.all(Object.entries(addresses).map(async ([chain, addressList]:[string, any])=>{
        const allAddresses = (await Promise.all(addressList.map((address:string) => sdk.api2.abi.call({
            target: address,
            params: [],
            abi: 'address[]:getAllMarkets',
            chain
          })))).flat().concat(addressList)
        return [chain, allAddresses]
    })))
}

export const addresses = comptrollers.filter(isAddressesUsable).map(addresses=>({
    name: addresses.name,
    id: addresses.id,
    getAddresses: findAllAddresses(addresses.addresses)
}))

export default addresses.map(addresses=>({
    name: addresses.name,
    id: addresses.id,
    getUsers: async (start:number, end:number) => countUsers(await addresses.getAddresses())(start, end)
}))