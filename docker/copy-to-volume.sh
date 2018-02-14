#!/usr/bin/env bash

echo off
echo Copying app to shared location...
PROJECT=mapper-annotator
cp -r /usr/local/mapper/${PROJECT} /app/
chmod 777 -R /app/${PROJECT}

echo Copy complete
