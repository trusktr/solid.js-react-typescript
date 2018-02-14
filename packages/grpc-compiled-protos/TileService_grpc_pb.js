// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('grpc');
var TileService_pb = require('./TileService_pb.js');
var CoordinateReferenceSystem_pb = require('./CoordinateReferenceSystem_pb.js');

function serialize_mapper_models_SearchTilesRequest(arg) {
	// console.log('serialize_mapper_models_SearchTilesRequest', arg)
  if (!(arg instanceof TileService_pb.SearchTilesRequest)) {
    throw new Error('Expected argument of type mapper.models.SearchTilesRequest');
  }
  return new Buffer(arg.serializeBinary());
}

function deserialize_mapper_models_SearchTilesRequest(buffer_arg) {
	// console.log('deserialize_mapper_models_SearchTilesRequest', arg)
	return TileService_pb.SearchTilesRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_mapper_models_SearchTilesResponse(arg) {
	// console.log('serialize_mapper_models_SearchTilesResponse', arg)
	if (!(arg instanceof TileService_pb.SearchTilesResponse)) {
    throw new Error('Expected argument of type mapper.models.SearchTilesResponse');
  }
  return new Buffer(arg.serializeBinary());
}

function deserialize_mapper_models_SearchTilesResponse(buffer_arg) {
	// console.log('deserialize_mapper_models_SearchTilesResponse', arg)
	return TileService_pb.SearchTilesResponse.deserializeBinary(new Uint8Array(buffer_arg));
}


var TileServiceService = exports.TileServiceService = {
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
};

exports.TileServiceClient = grpc.makeGenericClientConstructor(TileServiceService, "x");
