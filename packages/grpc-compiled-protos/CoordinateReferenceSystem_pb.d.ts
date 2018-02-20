// package: mapper.models
// file: CoordinateReferenceSystem.proto

/* tslint:disable */

import * as jspb from "google-protobuf";

export class SpatialTileIndexMessage extends jspb.Message { 
    getSrid(): SpatialReferenceSystemIdentifier;
    setSrid(value: SpatialReferenceSystemIdentifier): void;

    getScale(): SpatialTileScale;
    setScale(value: SpatialTileScale): void;

    getXIndex(): number;
    setXIndex(value: number): void;

    getYIndex(): number;
    setYIndex(value: number): void;

    getZIndex(): number;
    setZIndex(value: number): void;

    getSpatialReferenceUpdated(): number;
    setSpatialReferenceUpdated(value: number): void;


    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): SpatialTileIndexMessage.AsObject;
    static toObject(includeInstance: boolean, msg: SpatialTileIndexMessage): SpatialTileIndexMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: SpatialTileIndexMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): SpatialTileIndexMessage;
    static deserializeBinaryFromReader(message: SpatialTileIndexMessage, reader: jspb.BinaryReader): SpatialTileIndexMessage;
}

export namespace SpatialTileIndexMessage {
    export type AsObject = {
        srid: SpatialReferenceSystemIdentifier,
        scale: SpatialTileScale,
        xIndex: number,
        yIndex: number,
        zIndex: number,
        spatialReferenceUpdated: number,
    }
}

export class GeographicPoint3DMessage extends jspb.Message { 
    getSrid(): SpatialReferenceSystemIdentifier;
    setSrid(value: SpatialReferenceSystemIdentifier): void;

    getX(): number;
    setX(value: number): void;

    getY(): number;
    setY(value: number): void;

    getZ(): number;
    setZ(value: number): void;


    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): GeographicPoint3DMessage.AsObject;
    static toObject(includeInstance: boolean, msg: GeographicPoint3DMessage): GeographicPoint3DMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: GeographicPoint3DMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): GeographicPoint3DMessage;
    static deserializeBinaryFromReader(message: GeographicPoint3DMessage, reader: jspb.BinaryReader): GeographicPoint3DMessage;
}

export namespace GeographicPoint3DMessage {
    export type AsObject = {
        srid: SpatialReferenceSystemIdentifier,
        x: number,
        y: number,
        z: number,
    }
}

export enum SpatialReferenceSystemIdentifier {
    UNKNOWN_SRID = 0,
    LOCAL_CAMERA = 1,
    LOCAL_INERTIAL = 2,
    ECEF = 3,
    LAT_LNG = 4,
    LAT_LNG_ALT = 5,
    UTM_1N = 6,
    UTM_2N = 7,
    UTM_3N = 8,
    UTM_4N = 9,
    UTM_5N = 10,
    UTM_6N = 11,
    UTM_7N = 12,
    UTM_8N = 13,
    UTM_9N = 14,
    UTM_10N = 15,
    UTM_11N = 16,
    UTM_12N = 17,
    UTM_13N = 18,
    UTM_14N = 19,
    UTM_15N = 20,
    UTM_16N = 21,
    UTM_17N = 22,
    UTM_18N = 23,
    UTM_19N = 24,
    UTM_20N = 25,
    UTM_21N = 26,
    UTM_22N = 27,
    UTM_23N = 28,
    UTM_24N = 29,
    UTM_25N = 30,
    UTM_26N = 31,
    UTM_27N = 32,
    UTM_28N = 33,
    UTM_29N = 34,
    UTM_30N = 35,
    UTM_31N = 36,
    UTM_32N = 37,
    UTM_33N = 38,
    UTM_34N = 39,
    UTM_35N = 40,
    UTM_36N = 41,
    UTM_37N = 42,
    UTM_38N = 43,
    UTM_39N = 44,
    UTM_40N = 45,
    UTM_41N = 46,
    UTM_42N = 47,
    UTM_43N = 48,
    UTM_44N = 49,
    UTM_45N = 50,
    UTM_46N = 51,
    UTM_47N = 52,
    UTM_48N = 53,
    UTM_49N = 54,
    UTM_50N = 55,
    UTM_51N = 56,
    UTM_52N = 57,
    UTM_53N = 58,
    UTM_54N = 59,
    UTM_55N = 60,
    UTM_56N = 61,
    UTM_57N = 62,
    UTM_58N = 63,
    UTM_59N = 64,
    UTM_60N = 65,
    UTM_1S = 66,
    UTM_2S = 67,
    UTM_3S = 68,
    UTM_4S = 69,
    UTM_5S = 70,
    UTM_6S = 71,
    UTM_7S = 72,
    UTM_8S = 73,
    UTM_9S = 74,
    UTM_10S = 75,
    UTM_11S = 76,
    UTM_12S = 77,
    UTM_13S = 78,
    UTM_14S = 79,
    UTM_15S = 80,
    UTM_16S = 81,
    UTM_17S = 82,
    UTM_18S = 83,
    UTM_19S = 84,
    UTM_20S = 85,
    UTM_21S = 86,
    UTM_22S = 87,
    UTM_23S = 88,
    UTM_24S = 89,
    UTM_25S = 90,
    UTM_26S = 91,
    UTM_27S = 92,
    UTM_28S = 93,
    UTM_29S = 94,
    UTM_30S = 95,
    UTM_31S = 96,
    UTM_32S = 97,
    UTM_33S = 98,
    UTM_34S = 99,
    UTM_35S = 100,
    UTM_36S = 101,
    UTM_37S = 102,
    UTM_38S = 103,
    UTM_39S = 104,
    UTM_40S = 105,
    UTM_41S = 106,
    UTM_42S = 107,
    UTM_43S = 108,
    UTM_44S = 109,
    UTM_45S = 110,
    UTM_46S = 111,
    UTM_47S = 112,
    UTM_48S = 113,
    UTM_49S = 114,
    UTM_50S = 115,
    UTM_51S = 116,
    UTM_52S = 117,
    UTM_53S = 118,
    UTM_54S = 119,
    UTM_55S = 120,
    UTM_56S = 121,
    UTM_57S = 122,
    UTM_58S = 123,
    UTM_59S = 124,
    UTM_60S = 125,
}

export enum SpatialTileScale {
    _010_010_010 = 0,
    _008_008_008 = 1,
}
