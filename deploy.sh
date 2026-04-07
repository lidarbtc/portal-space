#!/bin/bash
set -e

make build
./portal-space --discovery=true
