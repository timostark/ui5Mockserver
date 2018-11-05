import { UI5MockSettings, ServiceSettingsGlobal, ServiceSettingsDic } from "./ui5mockrc";
import fs = require("fs");
import args from "./params";
import writeFile = require('write');

class Config {
    private settings: UI5MockSettings;
    private loadPromise: Promise<UI5MockSettings>;

    private _loadConfig(): Promise<UI5MockSettings> {
        return new Promise<UI5MockSettings>((resolve, reject) => {
            var fsData = fs.readFileSync("mockconfig.json").toString();
            try {
                this.settings = JSON.parse(fsData);
            } catch (err) {
                reject(err);
            }

            //additionally merge the command line arguments..
            this.settings.global.manifest = this.settings.global.manifest ? this.settings.global.manifest : "webapp/manifest.json";
            this.settings.global.maxRequestLength = typeof this.settings.global.maxRequestLength !== "undefined" ? this.settings.global.maxRequestLength : 100;

            for (var sService in this.settings.service) {
                var oService = this.settings.service[sService];
                oService.respectAddressable = typeof oService.respectAddressable === "undefined" ? true : oService.respectAddressable;
            }
            resolve(this.settings);
        });
    };

    public isAuthentificationDataProvided(): boolean {
        return typeof this.settings.global.user !== "undefined" || typeof args.user !== "undefined";
    }

    public getUser(): string {
        return this.settings.global.user ? this.settings.global.user : args.user;
    }

    public getPassword(): string {
        return this.settings.global.password ? this.settings.global.password : args.password;
    }

    public async storeSettings() {
        delete this.settings.global.componentId;
        delete this.settings.global.modulePath;
        delete this.settings.global.modulePathOut;
        var aDelete = [];
        for (var sService in this.settings.service) {
            if (this.settings.service[sService].foundInManifest !== true) {
                aDelete.push(sService);
            }
            delete this.settings.service[sService].foundInManifest;
            delete this.settings.service[sService].localUri;
            delete this.settings.service[sService].uri;
        }
        aDelete.forEach((sService) => { delete this.settings.service[sService] } );
        var sStoreJSON = JSON.stringify(this.settings,null,3);

        await writeFile.promise("mockconfig.json", sStoreJSON);
    }

    private _loadManifest(): Promise<UI5MockSettings> {
        var that = this;
        return new Promise<UI5MockSettings>((resolve, reject) => {
            var data = fs.readFileSync(this.settings.global.manifest);
            //load and interpretete data..
            var oJSON = JSON.parse(data.toString());
            var oApp = oJSON["sap.app"];

            this.settings.global.componentId = oApp.id;
            this.settings.global.modulePath = oApp.id.split(".").join("/");

            //remove the local manifest file..
            this.settings.global.modulePath = oApp.id.split(".").join("/");
            var aAllPaths = this.settings.global.manifest.split("/");
            aAllPaths.pop();
            var sPath = aAllPaths.join();
            if (this.settings.global.outDir.indexOf(sPath) !== -1) {
                this.settings.global.modulePathOut = this.settings.global.outDir.replace(sPath, "");
                if (this.settings.global.modulePathOut.charAt(this.settings.global.modulePathOut.length - 1) === "/") {
                    this.settings.global.modulePathOut = this.settings.global.modulePathOut.substring(0, this.settings.global.modulePathOut.length - 1);
                }
                if (this.settings.global.modulePathOut.charAt(0) === "/") {
                    this.settings.global.modulePathOut = this.settings.global.modulePathOut.substring(1);
                }
            } else {
                throw "the out folder must be within the relative folder of the manifest folder (mostly webapp)";
            }

            if (oApp.dataSources) {
                for (var sService in oApp.dataSources) {
                    var oService = oApp.dataSources[sService];
                    if (oService.type !== "OData" ||
                        (oService.settings && oService.settings.odataVersion && oService.settings.odataVersion !== "2.0")) {
                        continue;
                    }

                    //merge the information into our settings..
                    if (!this.settings.service) {
                        this.settings.service = {}
                    }
                    var oCurService = this.settings.service[sService];
                    if (!oCurService) {
                        oCurService = {
                            entitySet: {}
                        }
                    }
                    oCurService.localUri = oService.settings.localUri;
                    oCurService.uri = oService.uri;
                    oCurService.foundInManifest = true;
                    this.settings.service[sService] = oCurService;
                }
            }
            resolve(this.settings);
        });
    }

    private get(): Promise<UI5MockSettings> {
        if (!this.loadPromise) {
            this.loadPromise = this._loadConfig().then(o => this._loadManifest());
        }
        return this.loadPromise;
    }

    public getGlobal(): Promise<ServiceSettingsGlobal> {
        return this.get().then(oSettings => oSettings.global);
    }

    public getServices(): Promise<ServiceSettingsDic> {
        return this.get().then(oSettings => oSettings.service);
    }

    constructor() {
    }
}

export var ConfigHandler = new Config();