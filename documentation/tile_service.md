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
Make a `SOURCE_DIR` to contain the Perception tiles. For the sake of consistency, name it "BaseGeometryTiles". For example:

	SOURCE_DIR=~/BaseGeometryTiles

Run [RegisteredScansToTiles](https://github.com/Signafy/Perception/tree/develop/apps/Core/RegisteredScansToTiles) with:

	--output_path=${SOURCE_DIR}
	--tile_type=BaseGeometryTiles

## Configure The Server
Copy [LoadTiles.sh](https://github.com/Signafy/mapper-hdk-map-service/blob/master/bin/LoadTiles.sh) and enter suitable configuration values.

 - set `SCALE` to match `--tile_scale` in `RegisteredScansToTiles`
 - set `SOURCE_DIR` to match `--output_path` in `RegisteredScansToTiles`
 - set `DATABASE_DIR` to something sensible

Run `LoadTiles.sh`. It will create `DATABASE_DIR` if necessary.

## Run The Server
Copy [TileServer.sh](https://github.com/Signafy/mapper-hdk-map-service/blob/master/bin/TileServer.sh).

 - set `DATABASE_DIR` to match the one in `LoadTiles.sh`

Run `TileServer.sh`. It reads from `DATABASE_DIR` and streams tile data through its public TCP port.
