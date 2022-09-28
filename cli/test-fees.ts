import { handler } from "./getFees";
import { protocolAdapterData } from "../src/utils/adapters";
import { fetchConfig } from '../src/utils/config';


export function checkArguments(argv: string[]) {
    if (argv.length < 3) {
        console.error(`Missing argument, you need to provide the filename of the adapter to test.`);
        process.exit(1);
    }
}

// Check if all arguments are present
checkArguments(process.argv);

const runAdapter = async () => {
    const adapterKey = process.argv[2]
    const config = await fetchConfig();
    const protocolIndex = protocolAdapterData(config).findIndex(va => va.adapterKey === adapterKey)

    const timestamp = process.argv[3]

    if (!protocolIndex) {
        console.error(`Cannot find adapterKey, please check if ${adapterKey} exists`);
        process.exit(1);
    } else {
        handler({
            adapterFolder: adapterKey,
            timestamp: +timestamp,
        }).finally(()=>process.exit(0))
    }
}

(async () => {
    await runAdapter();
    // process.exit(0);
})();
