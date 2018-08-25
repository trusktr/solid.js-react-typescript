#!/usr/bin/env bash

# Exit if there is an error
set -e

#--no-include-email
eval $(aws ecr get-login --region us-east-1)
