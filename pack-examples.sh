#!/bin/bash
set -e

echo "// Code auto-generated by $(basename $0)."
echo "// Do not edit."
echo "///<reference path=\"typings/browserify/browserify.d.ts\"/>"
echo "var fs = require('fs');"
echo "var EisenScripts : { [s: string]: string; } = {};"
for i in $(ls examples/*.es); do
	base=$(basename $i)
	echo "EisenScripts[\"${base%%.es}\"]=fs.readFileSync('$i', 'ascii');";
done
echo "export = EisenScripts;"
