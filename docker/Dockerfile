# Ubuntu 16.04 (LTS)
# https://hub.docker.com/_/ubuntu/
FROM ubuntu:xenial-20170119

ENV DEST=/usr/local/mapper
ENV VISUALIZER_DEST=$DEST/mapper-annotator
RUN mkdir -p $VISUALIZER_DEST
COPY bin $VISUALIZER_DEST/bin
COPY etc $VISUALIZER_DEST/etc
COPY packages $VISUALIZER_DEST/packages
COPY .*rc $VISUALIZER_DEST/
COPY *.json $VISUALIZER_DEST/
ENV BUILD_SCRIPTS_DIR=build-scripts
ENV BUILD_SCRIPTS_DEST=$VISUALIZER_DEST/$BUILD_SCRIPTS_DIR
RUN mkdir -p $BUILD_SCRIPTS_DEST
COPY $BUILD_SCRIPTS_DIR/build.sh $BUILD_SCRIPTS_DEST/
COPY $BUILD_SCRIPTS_DIR/hdk-install.sh $BUILD_SCRIPTS_DEST/
COPY docker/copy-to-volume.sh $DEST/
RUN chmod +x $DEST/copy-to-volume.sh

CMD $DEST/copy-to-volume.sh

