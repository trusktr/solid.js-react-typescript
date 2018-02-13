# specify the node base image with your desired version node:<version>
FROM node:6
# replace this with your application's default port
EXPOSE 8888

#
# Install Electron
#
RUN npm install -g electron
RUN npm install -g electron-packager

RUN apt-get update && \
	apt-get install -y \
	libgtk2.0-0 \
	libx11-xcb-dev \
	libxss-dev \
	libgconf2-dev \
	libnss3-dev \
	libasound2-dev \
	libxtst-dev

ENV VISUALIZER_DEST=/tmp/mapper-annotator
RUN mkdir $VISUALIZER_DEST
COPY bin $VISUALIZER_DEST/bin
COPY etc $VISUALIZER_DEST/etc
COPY packages $VISUALIZER_DEST/packages
COPY package.json $VISUALIZER_DEST/
COPY tsconfig.json $VISUALIZER_DEST/
COPY tslint.json $VISUALIZER_DEST/

