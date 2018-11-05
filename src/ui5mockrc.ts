export interface ServiceSettingsGlobal {
    user ?: string,
    componentId?: string,
    modulePath?: string,
    modulePathOut?: string,
    serverPath: string,
    password ?: string,
    manifest ?: string,
    maxRequestLength ?: number,
    globalFilter?: ServiceSettingsGlobalFilter,
    outDir: string
};

export interface ServiceSettingsGlobalFilter {
    [attribute: string]: number[] | string[] | boolean[];
};

export interface AttributeSettings {
    fakerSettings ?: string,
    isNumC ?: boolean,
    isNumberGenerator ?: boolean,
    sourceEntitySet ?: string,
    sourceAttribute ?: string
};

export interface AttributeSettingsDic {
    [attribute: string]: AttributeSettings;
};

export interface EntitySettings {
    filter ?: string,
    generate ?: boolean,
    expand?: string,
    exclude ?: boolean,
    attributes?: AttributeSettingsDic
};


export interface EntitySettingsDic {
    [entity: string]: EntitySettings;
};

export interface ServiceSettings {
    uri ?: string,
    localUri?: string,
    exclude?: boolean,
    foundInManifest?: boolean,
    respectAddressable?: boolean,
    entitySet?: EntitySettingsDic
}

export interface ServiceSettingsDic {
    [service: string] : ServiceSettings;
}

export interface UI5MockSettings {
    global: ServiceSettingsGlobal,
    service?: ServiceSettingsDic
};