// package: mapper.models
// file: TileService.proto

/* tslint:disable */

import * as grpc from "grpc";
import * as TileService_pb from "./TileService_pb";
import * as CoordinateReferenceSystem_pb from "./CoordinateReferenceSystem_pb";

// interface ITileServiceService extends grpc.ServiceDefinition<grpc.UntypedServiceImplementation> {
//     ping: IPing;
//     searchTiles: ISearchTiles;
//     getTiles: IGetTiles;
// }

interface IPing {
    path: string; // "/mapper.models.TileService/Ping"
    requestStream: boolean; // false
    responseStream: boolean; // false
    requestType: TileService_pb.PingRequest;
    responseType: TileService_pb.PingRequest;
    requestSerialize: (arg: TileService_pb.PingRequest) => Buffer;
    requestDeserialize: (buffer: Uint8Array) => TileService_pb.PingRequest;
    responseSerialize: (arg: TileService_pb.PingRequest) => Buffer;
    responseDeserialize: (buffer: Uint8Array) => TileService_pb.PingRequest;
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
interface IGetTiles {
    path: string; // "/mapper.models.TileService/GetTiles"
    requestStream: boolean; // false
    responseStream: boolean; // false
    requestType: TileService_pb.GetTilesRequest;
    responseType: TileService_pb.GetTilesResponse;
    requestSerialize: (arg: TileService_pb.GetTilesRequest) => Buffer;
    requestDeserialize: (buffer: Uint8Array) => TileService_pb.GetTilesRequest;
    responseSerialize: (arg: TileService_pb.GetTilesResponse) => Buffer;
    responseDeserialize: (buffer: Uint8Array) => TileService_pb.GetTilesResponse;
}

export interface ITileServiceClient {
    ping(request: TileService_pb.PingRequest, callback: (error: Error | null, response: TileService_pb.PingRequest) => void): grpc.ClientUnaryCall;
    ping(request: TileService_pb.PingRequest, metadata: grpc.Metadata, callback: (error: Error | null, response: TileService_pb.PingRequest) => void): grpc.ClientUnaryCall;
    searchTiles(request: TileService_pb.SearchTilesRequest, callback: (error: Error | null, response: TileService_pb.SearchTilesResponse) => void): grpc.ClientUnaryCall;
    searchTiles(request: TileService_pb.SearchTilesRequest, metadata: grpc.Metadata, callback: (error: Error | null, response: TileService_pb.SearchTilesResponse) => void): grpc.ClientUnaryCall;
    getTiles(request: TileService_pb.GetTilesRequest, callback: (error: Error | null, response: TileService_pb.GetTilesResponse) => void): grpc.ClientUnaryCall;
    getTiles(request: TileService_pb.GetTilesRequest, metadata: grpc.Metadata, callback: (error: Error | null, response: TileService_pb.GetTilesResponse) => void): grpc.ClientUnaryCall;
}

// export const TileServiceService: ITileServiceService;
export class TileServiceClient extends grpc.Client implements ITileServiceClient {
    constructor(address: string, credentials: grpc.ChannelCredentials, options?: object);
    public ping(request: TileService_pb.PingRequest, callback: (error: Error | null, response: TileService_pb.PingRequest) => void): grpc.ClientUnaryCall;
    public ping(request: TileService_pb.PingRequest, metadata: grpc.Metadata, callback: (error: Error | null, response: TileService_pb.PingRequest) => void): grpc.ClientUnaryCall;
    public searchTiles(request: TileService_pb.SearchTilesRequest, callback: (error: Error | null, response: TileService_pb.SearchTilesResponse) => void): grpc.ClientUnaryCall;
    public searchTiles(request: TileService_pb.SearchTilesRequest, metadata: grpc.Metadata, callback: (error: Error | null, response: TileService_pb.SearchTilesResponse) => void): grpc.ClientUnaryCall;
    public getTiles(request: TileService_pb.GetTilesRequest, callback: (error: Error | null, response: TileService_pb.GetTilesResponse) => void): grpc.ClientUnaryCall;
    public getTiles(request: TileService_pb.GetTilesRequest, metadata: grpc.Metadata, callback: (error: Error | null, response: TileService_pb.GetTilesResponse) => void): grpc.ClientUnaryCall;
}
