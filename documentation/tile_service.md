# Tile Service

Annotator can retrieve tiles from a tile service running on localhost. It uses the [mapper-hdk-map-service](https://github.com/Signafy/mapper-hdk-map-service/) project which will:
 - consume one or more directories containing point cloud tiles
 - restructure them into its own directory structure and build an index
 - [serve tiles](https://github.com/Signafy/mapper-models/blob/master/src/main/proto/TileService.proto) on a local port via gRPC

## Prerequisites

- Install [Docker](https://www.docker.com/products/docker) and run the daemon
- Set up the [AWS CLI tools](https://docs.google.com/document/d/1x7yNMfRnDBJQt2FqrkDZyUa8a6w7KhgdqshYg4Au0sc/edit#) for access to our docker image repository

## Get The Server

### Refresh Docker auth credentials
These should be good for twelve hours:

    $(aws ecr get-login --no-include-email --region us-east-1)

### Pull the latest build

	docker pull 196031044544.dkr.ecr.us-east-1.amazonaws.com/mapper/strabo:latest

## Get Some Tiles
Make a `HOST_DIR` to contain the tiles.

Run [RegisteredScansToTiles](https://github.com/Signafy/Perception/tree/develop/apps/Core/RegisteredScansToTiles) with:

	--output_path=${HOST_DIR}/BaseGeometryTiles
	--tile_type=BaseGeometryTiles

The next step assumes the tiles live in a directory named `BaseGeometryTiles`.

## Configure The Server
Copy [LoadTilesFromPerception.sh](https://github.com/Signafy/mapper-hdk-map-service/blob/master/bin/LoadTilesFromPerception.sh) and enter suitable configuration values.
 - set `SCALE` to match `--tile_scale` in RegisteredScansToTiles
 - set `HOST_DIR` to match the one in RegisteredScansToTiles

Run `LoadTilesFromPerception.sh`. It will create a directory next to `BaseGeometryTiles` called `mapper-db`.

## Run The Server
Copy [TileServer.sh](https://github.com/Signafy/mapper-hdk-map-service/blob/master/bin/TileServer.sh).
 - set `HOST_DIR` to match the one in RegisteredScansToTiles

Run `TileServer.sh`. It reads from `mapper-db` and streams tile data through its public TCP port.
