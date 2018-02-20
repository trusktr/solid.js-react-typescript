// package: mapper.models
// file: TileService.proto

/* tslint:disable */

import * as jspb from "google-protobuf";
import * as CoordinateReferenceSystem_pb from "./CoordinateReferenceSystem_pb";

export class SearchTilesRequest extends jspb.Message { 

    hasRangeSearch(): boolean;
    clearRangeSearch(): void;
    getRangeSearch(): RangeSearchMessage | undefined;
    setRangeSearch(value?: RangeSearchMessage): void;


    hasRadiusSearch(): boolean;
    clearRadiusSearch(): void;
    getRadiusSearch(): RadiusSearchMessage | undefined;
    setRadiusSearch(value?: RadiusSearchMessage): void;

    clearLayerIdsList(): void;
    getLayerIdsList(): Array<string>;
    setLayerIdsList(value: Array<string>): void;
    addLayerIds(value: string, index?: number): string;

    getGetIfEmpty(): boolean;
    setGetIfEmpty(value: boolean): void;


    getSpatialSearchCase(): SearchTilesRequest.SpatialSearchCase;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): SearchTilesRequest.AsObject;
    static toObject(includeInstance: boolean, msg: SearchTilesRequest): SearchTilesRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: SearchTilesRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): SearchTilesRequest;
    static deserializeBinaryFromReader(message: SearchTilesRequest, reader: jspb.BinaryReader): SearchTilesRequest;
}

export namespace SearchTilesRequest {
    export type AsObject = {
        rangeSearch?: RangeSearchMessage.AsObject,
        radiusSearch?: RadiusSearchMessage.AsObject,
        layerIdsList: Array<string>,
        getIfEmpty: boolean,
    }

    export enum SpatialSearchCase {
        SPATIALSEARCH_NOT_SET = 0,
    
    RANGE_SEARCH = 1,

    RADIUS_SEARCH = 2,

    }

}

export class SearchTilesResponse extends jspb.Message { 
    clearTileInstancesList(): void;
    getTileInstancesList(): Array<TileInstanceMessage>;
    setTileInstancesList(value: Array<TileInstanceMessage>): void;
    addTileInstances(value?: TileInstanceMessage, index?: number): TileInstanceMessage;


    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): SearchTilesResponse.AsObject;
    static toObject(includeInstance: boolean, msg: SearchTilesResponse): SearchTilesResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: SearchTilesResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): SearchTilesResponse;
    static deserializeBinaryFromReader(message: SearchTilesResponse, reader: jspb.BinaryReader): SearchTilesResponse;
}

export namespace SearchTilesResponse {
    export type AsObject = {
        tileInstancesList: Array<TileInstanceMessage.AsObject>,
    }
}

export class TileInstanceMessage extends jspb.Message { 

    hasId(): boolean;
    clearId(): void;
    getId(): CoordinateReferenceSystem_pb.SpatialTileIndexMessage | undefined;
    setId(value?: CoordinateReferenceSystem_pb.SpatialTileIndexMessage): void;

    getVersion(): number;
    setVersion(value: number): void;


    getLayersMap(): jspb.Map<string, string>;
    clearLayersMap(): void;


    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): TileInstanceMessage.AsObject;
    static toObject(includeInstance: boolean, msg: TileInstanceMessage): TileInstanceMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: TileInstanceMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): TileInstanceMessage;
    static deserializeBinaryFromReader(message: TileInstanceMessage, reader: jspb.BinaryReader): TileInstanceMessage;
}

export namespace TileInstanceMessage {
    export type AsObject = {
        id?: CoordinateReferenceSystem_pb.SpatialTileIndexMessage.AsObject,
        version: number,

        layersMap: Array<[string, string]>,
    }
}

export class RangeSearchMessage extends jspb.Message { 

    hasCorner1(): boolean;
    clearCorner1(): void;
    getCorner1(): CoordinateReferenceSystem_pb.GeographicPoint3DMessage | undefined;
    setCorner1(value?: CoordinateReferenceSystem_pb.GeographicPoint3DMessage): void;


    hasCorner2(): boolean;
    clearCorner2(): void;
    getCorner2(): CoordinateReferenceSystem_pb.GeographicPoint3DMessage | undefined;
    setCorner2(value?: CoordinateReferenceSystem_pb.GeographicPoint3DMessage): void;

    getScale(): CoordinateReferenceSystem_pb.SpatialTileScale;
    setScale(value: CoordinateReferenceSystem_pb.SpatialTileScale): void;


    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): RangeSearchMessage.AsObject;
    static toObject(includeInstance: boolean, msg: RangeSearchMessage): RangeSearchMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: RangeSearchMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): RangeSearchMessage;
    static deserializeBinaryFromReader(message: RangeSearchMessage, reader: jspb.BinaryReader): RangeSearchMessage;
}

export namespace RangeSearchMessage {
    export type AsObject = {
        corner1?: CoordinateReferenceSystem_pb.GeographicPoint3DMessage.AsObject,
        corner2?: CoordinateReferenceSystem_pb.GeographicPoint3DMessage.AsObject,
        scale: CoordinateReferenceSystem_pb.SpatialTileScale,
    }
}

export class RadiusSearchMessage extends jspb.Message { 

    hasCenterPoint(): boolean;
    clearCenterPoint(): void;
    getCenterPoint(): CoordinateReferenceSystem_pb.GeographicPoint3DMessage | undefined;
    setCenterPoint(value?: CoordinateReferenceSystem_pb.GeographicPoint3DMessage): void;

    getRadius(): number;
    setRadius(value: number): void;

    getScale(): CoordinateReferenceSystem_pb.SpatialTileScale;
    setScale(value: CoordinateReferenceSystem_pb.SpatialTileScale): void;


    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): RadiusSearchMessage.AsObject;
    static toObject(includeInstance: boolean, msg: RadiusSearchMessage): RadiusSearchMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: RadiusSearchMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): RadiusSearchMessage;
    static deserializeBinaryFromReader(message: RadiusSearchMessage, reader: jspb.BinaryReader): RadiusSearchMessage;
}

export namespace RadiusSearchMessage {
    export type AsObject = {
        centerPoint?: CoordinateReferenceSystem_pb.GeographicPoint3DMessage.AsObject,
        radius: number,
        scale: CoordinateReferenceSystem_pb.SpatialTileScale,
    }
}
