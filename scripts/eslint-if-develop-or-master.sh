#!/usr/bin/env bash
if npm run dev-or-master; then npm run lint-fix -- $@ ; else : ; fi
