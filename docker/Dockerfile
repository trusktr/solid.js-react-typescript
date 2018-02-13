# Ubuntu 16.04 (LTS)
# https://hub.docker.com/_/ubuntu/
FROM ubuntu:xenial-20170119

ENV DEST=/usr/local/mapper
ENV VISUALIZER_DEST=$DEST/mapper-annotator
RUN mkdir -p $VISUALIZER_DEST
COPY bin $VISUALIZER_DEST/bin
COPY etc $VISUALIZER_DEST/etc
COPY packages $VISUALIZER_DEST/packages
COPY package.json $VISUALIZER_DEST/
COPY tsconfig.json $VISUALIZER_DEST/
COPY tslint.json $VISUALIZER_DEST
COPY docker/copy-to-volume.sh $DEST/
RUN chmod +x $DEST/copy-to-volume.sh

CMD $DEST/copy-to-volume.sh

