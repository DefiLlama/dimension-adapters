import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const adapter: SimpleAdapter = {
    deadFrom: '2025-04-26', // https://apex-pro.gitbook.io/apex-pro/apex-pro-discontinued/about-apex-pro
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: () => { throw new Error("Apex Pro has been discontinued") },
            start: '2022-10-05',
        }
    },
};

export default adapter;
