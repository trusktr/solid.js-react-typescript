#Mapper Annotator/Visualizer Docker Tools
Currently the docker container serves as a delivery method.  Scripts are used to copy the app to the host file system for native execution.

## Building
`docker build -f docker/Dockerfile -t <container>:<tag> .`

#### Example
`docker build -f docker/Dockerfile -t mapper-annotator-conveyer:0.1.0 .`

## Running
This step simply: 
* starts the container
* copies the application folder and source
* exits the container

`mkdir <dst>`

`docker run --rm -it --mount type=bind,source=<dst>,target=/app --name <name> <container>:<tag>`

#### Example
`mkdir -p /tmp/app`

`docker run --rm -it --mount type=bind,source=/tmp/app,target=/app --name visualizer-provider mapper-annotator-conveyer:0.1.0`

## Installing and running the Annotator/Visualizer
`cd <dst>/mapper-annotator`

`./install-and-run.sh`
