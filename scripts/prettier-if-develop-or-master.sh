#!/usr/bin/env bash
if npm run dev-or-master; then prettier --write $@ ; else : ; fi
