import addresses from "./addresses"
import { countUsers } from "../utils/countUsers";

export default addresses.map(project=>({
    name: project.name,
    id: project.id,
    addresses: project.addresses,
    getUsers: countUsers(project.addresses as any)
}))
