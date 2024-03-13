import { isAddressesUsable } from "../utils/countUsers";
import { ProtocolAddresses } from "../utils/types";

export default ([
    {
        "id":"3107",
        "name":"EigenLayer",
        "addresses":{
            "ethereum":[
                "0x858646372cc42e1a627fce94aa7a7033e7cf075a"
            ]
        }
    }
] as ProtocolAddresses[]).filter(isAddressesUsable)

