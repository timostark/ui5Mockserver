import { ServiceSettings, ServiceSettingsGlobal, EntitySettings } from "./ui5mockrc";
import request = require('request-promise');
import writeFile = require('write');
import fs = require("fs");
import parse from './odata/parse';
import { EntitySet } from './odata/EntitySet';
import { Service } from './odata/Service';
import { ConfigHandler } from "./config";
import path = require('path');
import faker = require('faker/locale/en');

class ServiceProcessor {
    private serviceName: string;
    private settings: ServiceSettings;
    private metadata: Service;
    private globalConfig: ServiceSettingsGlobal;
    private initPromise: Promise<void>;

    constructor(serviceName: string) {
        this.serviceName = serviceName;
        this.initPromise = this._init();
    }

    private _init(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            ConfigHandler.getServices().then((service) => {
                if (!service[this.serviceName]) {
                    service[this.serviceName] = {}
                }
                this.settings = service[this.serviceName];
            }, reject).then(() =>
                ConfigHandler.getGlobal().then((global) => {
                    this.globalConfig = global;
                    resolve();
                }));
        });
    }

    private _getRequestOptions(localUrl: string) {
        var oReqObj = {
            url: this.globalConfig.serverPath + this.settings.uri + "/" + localUrl,
            'strictSSL': false
        };

        if (ConfigHandler.isAuthentificationDataProvided() === true) {
            oReqObj["auth"] = {
                'user': ConfigHandler.getUser(),
                'pass': ConfigHandler.getPassword(),
                'sendImmediately': false
            }
        };

        return oReqObj;
    }

    public async isInitialized(): Promise<void> {
        return this.initPromise;
    }

    public async loadMetadata() {
        await this.isInitialized();

        console.log("load metadata of " + this.serviceName);
        var oOptions = this._getRequestOptions("$metadata");
        await request.get(oOptions).then(
            (xml) => parse(xml).then((metadata) => this.metadata = metadata));
    }

    private _processEntitySetResult(sJSON: string): Array<Object> {
        var oResp = JSON.parse(sJSON);
        if (!(oResp && oResp.d && oResp.d.results)) {
            return [];
        }

        //delete metadata..
        for (var j = 0; j < oResp.d.results.length; j++) {
            delete oResp.d.results[j].__metadata;
        }

        var aRespFinal = oResp.d.results;
        return aRespFinal;
    }

    private async _writeOutFile(sLocalFileName: string, sContent: string) {
        var config = await ConfigHandler.getGlobal();
        var sFolder = config.outDir + "/" + this.serviceName + "/" + sLocalFileName;
        await writeFile.promise(sFolder, sContent).then(function (err) {
            err = err;
        });
    }

    private async _getEntitySet(oEntitySet: EntitySettings, oEntityMetadata: any): Promise<string> {
        var sTopString = (this.globalConfig.maxRequestLength !== -1) ? ("&$top=" + this.globalConfig.maxRequestLength) : "";
        var sFilterString = (oEntitySet && oEntitySet.filter) ? ("&$filter=" + oEntitySet.filter) : "";
        var sExpandString = (oEntitySet && oEntitySet.expand) ? ("&$expand=" + oEntitySet.expand) : "";

        //check if we need to add a global filter for global attributes - local filter is always overwriting (not perfect, but ok for the moment..)
        if (sFilterString.length === 0) {
            var bFirst = true;
            var sCurrentFilter = "";
            for (var sAttr in this.globalConfig.globalFilter) {
                var aFound = oEntityMetadata.entityType.properties.filter((oEntry) => { return oEntry.name === sAttr });
                if (aFound.length === 0) {
                    continue;
                }
                var oFound = aFound[0];
                sCurrentFilter += "( ";
                for (var i = 0; i < this.globalConfig.globalFilter[sAttr].length; i++) {
                    sCurrentFilter += sAttr + " eq '" + this.globalConfig.globalFilter[sAttr][i] + "'";
                }
                sCurrentFilter = sCurrentFilter + " )";
                if (bFirst === false) {
                    sCurrentFilter += " and ";
                }
                bFirst = false;
            }
            if (bFirst === false) {
                sFilterString = "&$filter=" + sCurrentFilter;
            }
        }

        var oOptions = this._getRequestOptions(oEntityMetadata.name + "?$format=json" + sExpandString + sFilterString + sTopString);
        var oData = await request.get(oOptions);
        return oData.toString();
    }

    private _generate(oEntitySettings: EntitySettings, oEntityMetadata: any) {
        var aResult = {
            "d": {
                "results": []
            }
        };
        for (var i = 0; i < 100; i++) {
            var oGenObject = {};
            for (var s in oEntitySettings.attributes) {
                oGenObject[s] = faker.fake("{{" + oEntitySettings.attributes[s].fakerSettings + "}}");
            }
            aResult.d.results.push(oGenObject);
        }

        return JSON.stringify(aResult);
    }

    private async _processEntitySet(oEntitySet: EntitySet) {
        console.log("process entity set " + oEntitySet.name);
        var oSettings = this.settings.entitySet[oEntitySet.name];
        if (oSettings && oSettings.exclude === true) {
            return;
        }
        if (this.settings.respectAddressable === true && oEntitySet.addressable === false) {
            return;
        }

        var sJSON = "";
        if (oSettings.generate === false) {
            sJSON = await this._getEntitySet(oSettings, oEntitySet);
        } else {
            sJSON = this._generate(oSettings, oEntitySet);
        }

        var oResult = this._processEntitySetResult(sJSON);
        var sContent = JSON.stringify(oResult, null, 2)
        await this._writeOutFile(oEntitySet.name + ".json", sContent);
    }

    private _camelCaseString(inp: string): string {
        return inp.replace(/(?:^\w|[A-Z]|\b\w)/g, function (letter, index) {
            return index == 0 ? letter.toLowerCase() : letter.toUpperCase();
        }).replace(/\s+/g, '');
    }

    private async _processMockServer() {
        var appDir = path.dirname(require.main.filename);

        var sMockServerBasis = fs.readFileSync(appDir + "/../data/mockserver.base.template").toString();
        var sModuleBasis = this.globalConfig.modulePath + "/" + this.globalConfig.modulePathOut + "/" + "mockServer";
        sModuleBasis = sModuleBasis.split("//").join("/");
        var sModuleDot = sModuleBasis.split("/").join(".");
        sMockServerBasis = sMockServerBasis.split("$$TEMPLATE_INCLUDE_MOCKSERVER_BASIS_DOT$$").join(sModuleDot);
        sMockServerBasis = sMockServerBasis.split("$$TEMPLATE_INCLUDE_MOCKSERVER_BASIS$$").join(sModuleBasis);

        await writeFile.promise(this.globalConfig.outDir + "/mockServer.js", sMockServerBasis);

        var sMockServerExtension = fs.readFileSync(appDir + "/../data/mockserver.extension.template").toString();
        var sOwnModuleName = this._camelCaseString(this.serviceName) + "_mockServer";
        var sModuleExtension = this.globalConfig.modulePath + "/" + this.globalConfig.modulePathOut + "/" + sOwnModuleName;
        sModuleExtension = sModuleExtension.split("//").join("/");

        sMockServerExtension = sMockServerExtension.split("$$TEMPLATE_SERVICE_NAME$$").join(sModuleExtension);
        sMockServerExtension = sMockServerExtension.split("$$TEMPLATE_INCLUDE_MOCKSERVER_BASIS$$").join(sModuleBasis);

        var sSuperCall = "\t\t\tMockServer.call(this, '" + this.globalConfig.modulePath + "','" + this.serviceName + "','" + this.globalConfig.modulePathOut + "/" + this.serviceName + "');";
        sMockServerExtension = sMockServerExtension.split("$$TEMPLATE_CALL_SUPER$$").join(sSuperCall);

        //create impl. for "self-implementation" - start with the function modules..
        var sBaseString = "";
        var sFunctionString = "";
        for (var i = 0; i < this.metadata.functions.length; i++) {
            var oFunction = this.metadata.functions[i];
            sBaseString += "\t\t\taRequests.push({\n";
            sBaseString += "\t\t\t\tmethod: '" + "GET" + "',\n";
            sBaseString += "\t\t\t\tpath: '" + oFunction.name + "(.*)',\n";
            sBaseString += "\t\t\t\tresponse: function(oXhr, sUrlParams) {\n"
            sBaseString += "\t\t\t\t\treturn this._" + this._camelCaseString(oFunction.name) + "(oXhr, sUrlParams);\n";
            sBaseString += "\t\t\t\t}.bind(this)\n";
            sBaseString += "\t\t\t});";

            sFunctionString += "\t\t_" + this._camelCaseString(oFunction.name) + " : function(oXhr, sUrlParams) { //ABSTRACT - overwrite in upper class..\n";
            sFunctionString += "\t\t\t" + "//example: oXhr.respondJSON(200, {}, JSON.stringify({}));\n\t\t\treturn true;\n";
            sFunctionString += "\t\t}";

            if (i !== this.metadata.functions.length - 1) {
                sFunctionString += ",";
                sFunctionString += "\n\n"
                sBaseString += "\n"
            }
        }
        if (sFunctionString.length) {
            sFunctionString = ",\n\n\n" + sFunctionString;
        }

        //process information about entityconfiguration..
        var oEntityConfig = {}; //$$TEMPLATE_ENTITY_CONFIGURATION$$
        for ( var sEntity in this.settings.entitySet ) {
            var oEntity = this.settings.entitySet[sEntity];
            oEntityConfig[sEntity] = {};
            for (var sAttr in oEntity.attributes ) {
                var oAttr = oEntity.attributes[sAttr];
                if ( oAttr.isNumberGenerator === true || oAttr.isNumC === true || oAttr.sourceAttribute || oAttr.sourceEntitySet ) {
                    oEntity[sEntity][sAttr] = {};
                }
                if ( oAttr.isNumberGenerator === true ) {
                    oEntity[sEntity][sAttr]["IsNumberRange"] = true;
                }
                if (oAttr.isNumC === true) {
                    oEntity[sEntity][sAttr]["IsNumC"] = true;
                }
            }
        }
        sMockServerExtension = sMockServerExtension.split("$$TEMPLATE_ENTITY_CONFIGURATION$$").join(JSON.stringify(oEntityConfig,null,3));

        sMockServerExtension = sMockServerExtension.split("$$TEMPLATE_OWN_REQUESTS$$").join(sBaseString);
        sMockServerExtension = sMockServerExtension.split("$$TEMPLATE_OWN_BASE_IMPLEMENTATIONS$$").join(sFunctionString);
        await writeFile.promise(this.globalConfig.outDir + "/" + sOwnModuleName + ".js", sMockServerExtension);
    }

    public async processConfigFile(bStore?: boolean) {
        await this.isInitialized();

        //create all entries within our settings, as per the standard..
        for (var i = 0; i < this.metadata.entitySets.length; i++) {
            var oEntry = this.metadata.entitySets[i];
            if (!this.settings.entitySet[oEntry.name]) {
                this.settings.entitySet[oEntry.name] = {
                    exclude: false,
                    filter: "",
                    expand: "",
                    generate: false,
                    attributes: {},
                }
            }

            for (var j = 0; j < oEntry.entityType.properties.length; j++) {
                var oProp = oEntry.entityType.properties[j];
                var sFakerSettings = "";
                if (oProp.type === "Edm.String") {
                    sFakerSettings = "random.word";
                } else if (oProp.type === "Edm.Boolean") {
                    sFakerSettings = "random.boolean";
                } else if (oProp.type === "Edm.Decimal" || oProp.type == "Edm.Double" || oProp.type === "Edm.Float") {
                    sFakerSettings = "random.float";
                } else if (oProp.type === "Edm.DateTime") {
                    sFakerSettings = "date.past"
                } else if (oProp.type === "Edm.Int16" || oProp.type === "Edm.Int32" || oProp.type === "Edm.Int32") {
                    sFakerSettings = "random.number"
                } else {
                    sFakerSettings = "random.word";
                }

                if (!this.settings.entitySet[oEntry.name].attributes[oProp.name]) {
                    this.settings.entitySet[oEntry.name].attributes[oProp.name] = {
                        fakerSettings: sFakerSettings,
                        isNumberGenerator: false,
                        isNumC: false
                    };
                } else {
                    var oAttr = this.settings.entitySet[oEntry.name].attributes[oProp.name];
                    oAttr.fakerSettings = typeof oAttr.fakerSettings !== "undefined" ? oAttr.fakerSettings : sFakerSettings;
                    oAttr.isNumberGenerator = typeof oAttr.isNumberGenerator !== "undefined" ? oAttr.isNumberGenerator : false;
                    oAttr.isNumC = typeof oAttr.isNumC !== "undefined" ? oAttr.isNumC : false;
                }
            }
        }

        this.settings = this.settings;
    }

    public async process() {
        await this.isInitialized();

        if (this.settings.exclude === true) {
            console.log("Skip Service " + this.serviceName);
            return;
        }
        if (this.settings.foundInManifest !== true) {
            console.log("Skip Service " + this.serviceName + "  (as not in service)");
            return;
        }

        //loop over all entities..
        for (var i = 0; i < this.metadata.entitySets.length; i++) {
            await this._processEntitySet(this.metadata.entitySets[i]);
        }

        await this._processMockServer();
    }
};

export default ServiceProcessor;