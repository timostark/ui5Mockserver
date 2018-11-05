const commandLineArgs = require('command-line-args')

const optionDefinitions = [
    { name: 'user', alias: 'u', type: String },
    { name: 'password', alias: 'p', type: String },
    { name: 'mode', alias: 'm', type: String, defaultValue: "run" }
];

const lineArgs = commandLineArgs(optionDefinitions);

export default lineArgs;