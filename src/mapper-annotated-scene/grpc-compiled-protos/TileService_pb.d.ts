// package: mapper.models
// file: TileService.proto

/* tslint:disable */

import * as jspb from "google-protobuf";
import * as CoordinateReferenceSystem_pb from "./CoordinateReferenceSystem_pb";

export class PingRequest extends jspb.Message {
    getRequestId(): string;
    setRequestId(value: string): void;


    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): PingRequestObject;
    static toObject(includeInstance: boolean, msg: PingRequest): PingRequestObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: PingRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): PingRequest;
    static deserializeBinaryFromReader(message: PingRequest, reader: jspb.BinaryReader): PingRequest;
}

export type PingRequestObject = {
    requestId: string,
}

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


    getSpatialSearchCase(): SpatialSearchCase;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): SearchTilesRequestObject;
    static toObject(includeInstance: boolean, msg: SearchTilesRequest): SearchTilesRequestObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: SearchTilesRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): SearchTilesRequest;
    static deserializeBinaryFromReader(message: SearchTilesRequest, reader: jspb.BinaryReader): SearchTilesRequest;
}

export type SearchTilesRequestObject = {
    rangeSearch?: RangeSearchMessageObject,
    radiusSearch?: RadiusSearchMessageObject,
    layerIdsList: Array<string>,
    getIfEmpty: boolean,
}

export enum SpatialSearchCase {
	SPATIALSEARCH_NOT_SET = 0,

	RANGE_SEARCH = 1,

	RADIUS_SEARCH = 2,
}

export class SearchTilesResponse extends jspb.Message {
    clearTileInstancesList(): void;
    getTileInstancesList(): Array<TileInstanceMessage>;
    setTileInstancesList(value: Array<TileInstanceMessage>): void;
    addTileInstances(value?: TileInstanceMessage, index?: number): TileInstanceMessage;


    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): SearchTilesResponseObject;
    static toObject(includeInstance: boolean, msg: SearchTilesResponse): SearchTilesResponseObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: SearchTilesResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): SearchTilesResponse;
    static deserializeBinaryFromReader(message: SearchTilesResponse, reader: jspb.BinaryReader): SearchTilesResponse;
}

export type SearchTilesResponseObject = {
    tileInstancesList: Array<TileInstanceMessageObject>,
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
    toObject(includeInstance?: boolean): TileInstanceMessageObject;
    static toObject(includeInstance: boolean, msg: TileInstanceMessage): TileInstanceMessageObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: TileInstanceMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): TileInstanceMessage;
    static deserializeBinaryFromReader(message: TileInstanceMessage, reader: jspb.BinaryReader): TileInstanceMessage;
}

export type TileInstanceMessageObject = {
    id?: CoordinateReferenceSystem_pb.SpatialTileIndexMessageObject,
    version: number,

    layersMap: Array<[string, string]>,
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
    toObject(includeInstance?: boolean): RangeSearchMessageObject;
    static toObject(includeInstance: boolean, msg: RangeSearchMessage): RangeSearchMessageObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: RangeSearchMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): RangeSearchMessage;
    static deserializeBinaryFromReader(message: RangeSearchMessage, reader: jspb.BinaryReader): RangeSearchMessage;
}

export type RangeSearchMessageObject = {
    corner1?: CoordinateReferenceSystem_pb.GeographicPoint3DMessageObject,
    corner2?: CoordinateReferenceSystem_pb.GeographicPoint3DMessageObject,
    scale: CoordinateReferenceSystem_pb.SpatialTileScale,
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
    toObject(includeInstance?: boolean): RadiusSearchMessageObject;
    static toObject(includeInstance: boolean, msg: RadiusSearchMessage): RadiusSearchMessageObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: RadiusSearchMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): RadiusSearchMessage;
    static deserializeBinaryFromReader(message: RadiusSearchMessage, reader: jspb.BinaryReader): RadiusSearchMessage;
}

export type RadiusSearchMessageObject = {
    centerPoint?: CoordinateReferenceSystem_pb.GeographicPoint3DMessageObject,
    radius: number,
    scale: CoordinateReferenceSystem_pb.SpatialTileScale,
}

export class GetTilesRequest extends jspb.Message {
    clearUrlsList(): void;
    getUrlsList(): Array<string>;
    setUrlsList(value: Array<string>): void;
    addUrls(value: string, index?: number): string;


    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): GetTilesRequestObject;
    static toObject(includeInstance: boolean, msg: GetTilesRequest): GetTilesRequestObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: GetTilesRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): GetTilesRequest;
    static deserializeBinaryFromReader(message: GetTilesRequest, reader: jspb.BinaryReader): GetTilesRequest;
}

export type GetTilesRequestObject = {
    urlsList: Array<string>
}

export class GetTilesResponse extends jspb.Message {
    clearTileContentsList(): void;
    getTileContentsList(): Array<TileContentsMessage>;
    setTileContentsList(value: Array<TileContentsMessage>): void;
    addTileContents(value?: TileContentsMessage, index?: number): TileContentsMessage;


    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): GetTilesResponseObject;
    static toObject(includeInstance: boolean, msg: GetTilesResponse): GetTilesResponseObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: GetTilesResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): GetTilesResponse;
    static deserializeBinaryFromReader(message: GetTilesResponse, reader: jspb.BinaryReader): GetTilesResponse;
}

export type GetTilesResponseObject = {
    tileContentsList: Array<TileContentsMessageObject>,
}

export class TileContentsMessage extends jspb.Message {
    getUrl(): string;
    setUrl(value: string): void;

    getContents(): Uint8Array | string;
    getContents_asU8(): Uint8Array;
    getContents_asB64(): string;
    setContents(value: Uint8Array | string): void;


    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): TileContentsMessageObject;
    static toObject(includeInstance: boolean, msg: TileContentsMessage): TileContentsMessageObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: TileContentsMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): TileContentsMessage;
    static deserializeBinaryFromReader(message: TileContentsMessage, reader: jspb.BinaryReader): TileContentsMessage;
}

export type TileContentsMessageObject = {
    url: string,
    contents: Uint8Array | string,
}
