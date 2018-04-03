#!/usr/bin/env bash

# Exit if there is an error
set -e

$(aws ecr get-login --no-include-email --region us-east-1)
