import { compoundV2Export, } from "../../helpers/compoundV2";

const baseUnitroller = "0xfBb21d0380beE3312B33c4353c8936a0F13EF26C";
const moonbeamUnitroller = "0x8E00D5e02E65A19337Cdba98bbA9F84d4186a180";
const moonriverUnitroller = "0x0b7a0EAA884849c6Af7a129e899536dDDcA4905E";
const optimismUnitroller = "0xCa889f40aae37FFf165BccF69aeF1E82b5C511B9";

export default compoundV2Export({ base: baseUnitroller, moonbeam: moonbeamUnitroller, moonriver: moonriverUnitroller, optimism: optimismUnitroller });
