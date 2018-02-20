// package: mapper.models
// file: TileService.proto

/* tslint:disable */

import * as grpc from "grpc";
import * as TileService_pb from "./TileService_pb";
import * as CoordinateReferenceSystem_pb from "./CoordinateReferenceSystem_pb";

interface ITileServiceService extends grpc.ServiceDefinition<grpc.UntypedServiceImplementation> {
    searchTiles: ISearchTiles;
}

interface ISearchTiles {
    path: string; // "/mapper.models.TileService/SearchTiles"
    requestStream: boolean; // false
    responseStream: boolean; // false
    requestType: TileService_pb.SearchTilesRequest;
    responseType: TileService_pb.SearchTilesResponse;
    requestSerialize: (arg: TileService_pb.SearchTilesRequest) => Buffer;
    requestDeserialize: (buffer: Uint8Array) => TileService_pb.SearchTilesRequest;
    responseSerialize: (arg: TileService_pb.SearchTilesResponse) => Buffer;
    responseDeserialize: (buffer: Uint8Array) => TileService_pb.SearchTilesResponse;
}

export interface ITileServiceClient {
    searchTiles(request: TileService_pb.SearchTilesRequest, callback: (error: Error | null, response: TileService_pb.SearchTilesResponse) => void): grpc.ClientUnaryCall;
    searchTiles(request: TileService_pb.SearchTilesRequest, metadata: grpc.Metadata, callback: (error: Error | null, response: TileService_pb.SearchTilesResponse) => void): grpc.ClientUnaryCall;
}

export const TileServiceService: ITileServiceService;
export class TileServiceClient extends grpc.Client implements ITileServiceClient {
    constructor(address: string, credentials: grpc.ChannelCredentials, options?: object);
    public searchTiles(request: TileService_pb.SearchTilesRequest, callback: (error: Error | null, response: TileService_pb.SearchTilesResponse) => void): grpc.ClientUnaryCall;
    public searchTiles(request: TileService_pb.SearchTilesRequest, metadata: grpc.Metadata, callback: (error: Error | null, response: TileService_pb.SearchTilesResponse) => void): grpc.ClientUnaryCall;
}
