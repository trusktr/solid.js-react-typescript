// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('grpc');
var TileService_pb = require('./TileService_pb.js');
var CoordinateReferenceSystem_pb = require('./CoordinateReferenceSystem_pb.js');

function serialize_mapper_models_GetTilesRequest(arg) {
  if (!(arg instanceof TileService_pb.GetTilesRequest)) {
    throw new Error('Expected argument of type mapper.models.GetTilesRequest');
  }
  return new Buffer(arg.serializeBinary());
}

function deserialize_mapper_models_GetTilesRequest(buffer_arg) {
  return TileService_pb.GetTilesRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_mapper_models_GetTilesResponse(arg) {
  if (!(arg instanceof TileService_pb.GetTilesResponse)) {
    throw new Error('Expected argument of type mapper.models.GetTilesResponse');
  }
  return new Buffer(arg.serializeBinary());
}

function deserialize_mapper_models_GetTilesResponse(buffer_arg) {
  return TileService_pb.GetTilesResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_mapper_models_PingRequest(arg) {
  if (!(arg instanceof TileService_pb.PingRequest)) {
    throw new Error('Expected argument of type mapper.models.PingRequest');
  }
  return new Buffer(arg.serializeBinary());
}

function deserialize_mapper_models_PingRequest(buffer_arg) {
  return TileService_pb.PingRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_mapper_models_SearchTilesRequest(arg) {
  if (!(arg instanceof TileService_pb.SearchTilesRequest)) {
    throw new Error('Expected argument of type mapper.models.SearchTilesRequest');
  }
  return new Buffer(arg.serializeBinary());
}

function deserialize_mapper_models_SearchTilesRequest(buffer_arg) {
  return TileService_pb.SearchTilesRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_mapper_models_SearchTilesResponse(arg) {
  if (!(arg instanceof TileService_pb.SearchTilesResponse)) {
    throw new Error('Expected argument of type mapper.models.SearchTilesResponse');
  }
  return new Buffer(arg.serializeBinary());
}

function deserialize_mapper_models_SearchTilesResponse(buffer_arg) {
  return TileService_pb.SearchTilesResponse.deserializeBinary(new Uint8Array(buffer_arg));
}


var TileServiceService = exports.TileServiceService = {
  ping: {
    path: '/mapper.models.TileService/Ping',
    requestStream: false,
    responseStream: false,
    requestType: TileService_pb.PingRequest,
    responseType: TileService_pb.PingRequest,
    requestSerialize: serialize_mapper_models_PingRequest,
    requestDeserialize: deserialize_mapper_models_PingRequest,
    responseSerialize: serialize_mapper_models_PingRequest,
    responseDeserialize: deserialize_mapper_models_PingRequest,
  },
  searchTiles: {
    path: '/mapper.models.TileService/SearchTiles',
    requestStream: false,
    responseStream: false,
    requestType: TileService_pb.SearchTilesRequest,
    responseType: TileService_pb.SearchTilesResponse,
    requestSerialize: serialize_mapper_models_SearchTilesRequest,
    requestDeserialize: deserialize_mapper_models_SearchTilesRequest,
    responseSerialize: serialize_mapper_models_SearchTilesResponse,
    responseDeserialize: deserialize_mapper_models_SearchTilesResponse,
  },
  getTiles: {
    path: '/mapper.models.TileService/GetTiles',
    requestStream: false,
    responseStream: false,
    requestType: TileService_pb.GetTilesRequest,
    responseType: TileService_pb.GetTilesResponse,
    requestSerialize: serialize_mapper_models_GetTilesRequest,
    requestDeserialize: deserialize_mapper_models_GetTilesRequest,
    responseSerialize: serialize_mapper_models_GetTilesResponse,
    responseDeserialize: deserialize_mapper_models_GetTilesResponse,
  },
};

exports.TileServiceClient = grpc.makeGenericClientConstructor(TileServiceService);
