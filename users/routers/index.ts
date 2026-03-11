import routerAddresses from "./routerAddresses"
import { countNewUsers, countUsers } from "../utils/countUsers";

export default routerAddresses.map(addresses=>({
    type: "protocol",
    name: addresses.name,
    id: addresses.id,
    addresses: addresses.addresses,
    chains: [...new Set(Object.keys(addresses.addresses))],
    getUsers: countUsers(addresses.addresses as any),
    getNewUsers: async (start:number, end:number) => countNewUsers(addresses.addresses as any, start, end)
}))
