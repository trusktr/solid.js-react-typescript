#!/usr/bin/env bash

echo off
echo Copying app to shared location...
cp -r /usr/local/mapper/mapper-annotator /app/
chmod 777 -R /app/mapper-annotator

echo Copy complete
