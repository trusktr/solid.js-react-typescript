#!/usr/bin/env bash

# Makes the container for hdk visualizer delivery.  Pushes it to the repo.

# Exit if there is an error
set -e

if [ -z $BUILD_NUMBER ]; then
    echo "No build number provided"
    exit 1
fi
if [ -z $GIT_BRANCH ]; then
    echo "No git branch provided"
    exit 1
fi

# Put the branch in the tag
if [ "$GIT_BRANCH" == 'master' ]; then
    branchLabel=""
else
    branchNameLower=`echo $GIT_BRANCH | sed 's/\//-/' | awk '{print tolower($0)}'`
    branchLabel="$branchNameLower."
fi

versionMajor=1
versionMinor=0
tagString="$branchLabel$versionMajor.$versionMinor.$BUILD_NUMBER"

CONTAINER=196031044544.dkr.ecr.us-east-1.amazonaws.com/hdk-visualizer
CONTAINER_VERSIONED=$CONTAINER:$tagString
echo "Building $CONTAINER_VERSIONED"
docker build \
    -f docker/Dockerfile \
    -t $CONTAINER_VERSIONED \
    .

if [ "$GIT_BRANCH" == 'master' ] || [ "$GIT_BRANCH" == 'develop' ]; then
    echo "Pushing $CONTAINER_VERSIONED"
    docker push $CONTAINER_VERSIONED
fi
