#!/usr/bin/env bash
if npm run dev-or-master; then npm run typecheck; else : ; fi
