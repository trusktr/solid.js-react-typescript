#!/bin/bash

function make_icns() {
  local file="${1}"
  local iconset="$(mktemp -d)"
  local output_icon="${2}.icns"

  sips --resampleHeightWidth 16 16 "${file}" --out "${iconset}/icon_16x16.png" &> /dev/null
  sips --resampleHeightWidth 32 32 "${file}" --out "${iconset}/icon_16x16@2x.png" &> /dev/null
  sips --resampleHeightWidth 32 32 "${file}" --out "${iconset}/icon_32x32.png" &> /dev/null
  sips --resampleHeightWidth 64 64 "${file}" --out "${iconset}/icon_32x32@2x.png" &> /dev/null
  sips --resampleHeightWidth 128 128 "${file}" --out "${iconset}/icon_128x128.png" &> /dev/null
  sips --resampleHeightWidth 256 256 "${file}" --out "${iconset}/icon_128x128@2x.png" &> /dev/null
  sips --resampleHeightWidth 256 256 "${file}" --out "${iconset}/icon_256x256.png" &> /dev/null
  sips --resampleHeightWidth 512 512 "${file}" --out "${iconset}/icon_256x256@2x.png" &> /dev/null
  sips --resampleHeightWidth 512 512 "${file}" --out "${iconset}/icon_512x512.png" &> /dev/null
  sips --resampleHeightWidth 1024 1024 "${file}" --out "${iconset}/icon_512x512@2x.png" &> /dev/null

  mv "${iconset}" "${iconset}.iconset"
  iconutil --convert icns "${iconset}.iconset" --output "${output_icon}"

  echo "${output_icon}" # so its path is returned when the function ends
}

make_icns build/icon.png build/icon