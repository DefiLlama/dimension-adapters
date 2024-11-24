import { Adapter } from "../adapters/types";
import { generateCBCommerceExports } from "../helpers/coinbase-commerce";

const adapter: Adapter = {
    version: 2,
    adapter: generateCBCommerceExports('0x3c6923D09ec77648ca923fFB4e50251120756faa'),
}

export default adapter;
