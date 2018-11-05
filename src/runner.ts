import args from "./params";
import ServiceProcessor from "./service";
import { ConfigHandler } from "./config";


class RunHandler {
    constructor() {
    }

    public async run() {
        const oServices = await ConfigHandler.getServices();

        for (var sService in oServices) {
            if (oServices[sService].foundInManifest === false) {
                continue;
            }
            
            var oSvcProc = new ServiceProcessor(sService);
            await oSvcProc.loadMetadata();
            await oSvcProc.processConfigFile();

            if (args.mode === "run") {
                await oSvcProc.process();
            }
        }

        if (args.mode === "init") {
            await ConfigHandler.storeSettings();
        }
    }
};


var runHandler = new RunHandler();
export default runHandler;