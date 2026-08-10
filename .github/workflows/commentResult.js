const { readFileSync, writeFileSync, mkdirSync } = require('fs');
const path = require('path');

function main() {
    const [, , log, outDir, adapterNameKey] = process.argv;
    const file = readFileSync(log, 'utf-8');

    const [, adapterName] = (adapterNameKey || '').split('@');

    const errorString = 'ERROR';
    const summaryIndex = file.indexOf('---------------------------------------------------');
    const errorIndex = file.indexOf(errorString);
    let body;

    if (summaryIndex != -1) {
        body = `The ${adapterName} adapter exports:
        \n \n ${file.replaceAll('\n', '\n    ')}`;
    } else if (errorIndex != -1) {
        body = `Error while running adapter ${adapterName} adapter:
        \n \n ${file.split(errorString)[1].replaceAll('\n', '\n    ')}`;
    } else {
        console.info(`No error or summary found in log file`);
        return;
    }

    console.info(`Preparing comment:\n${body}`);

    mkdirSync(outDir, { recursive: true });
    const safeName = (adapterNameKey || 'general').replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = `${Date.now()}-${process.pid}-${safeName}.md`;
    writeFileSync(path.join(outDir, fileName), body);
}
main();
