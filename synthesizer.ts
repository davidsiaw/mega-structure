// Copyright (c) 2016, Sebastien Sydney Robert Bigot
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
// 1. Redistributions of source code must retain the above copyright notice, this
//    list of conditions and the following disclaimer.
// 2. Redistributions in binary form must reproduce the above copyright notice,
//    this list of conditions and the following disclaimer in the documentation
//    and/or other materials provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
// ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
// WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
// DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
// ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
// (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
// LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
// ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
// SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//
// The views and conclusions contained in the software and documentation are those
// of the authors and should not be interpreted as representing official policies,
// either expressed or implied, of the FreeBSD Project.

///<reference path="typings/tsd.d.ts"/>
var eisenscript = require('./eisen-script');
var glmat = require('./bower_components/gl-matrix/dist/gl-matrix-min.js');

import ShapeInstance = require('./structure');
import collections = require('./node_modules/typescript-collections/collections');

enum Axis { X, Y, Z };

interface ASTNode {
	type: string;
}

interface DefStatement extends ASTNode {
	rule: string;
	weight: number;
	maxdepth: number;
	failover: string;
	production: InvocStatement[];
}

interface InvocStatement extends ASTNode {
	transformations: Transformation[];
	next: NextNode;
}

interface SetStatement extends ASTNode {
	// TODO
}

interface NextNode extends ASTNode {
	name: string;
}

interface Transformation {
	multiplier: number;
	sequence: ASTNode[];
}

interface TransNode extends ASTNode {
	t: number[];
}

interface RotNode extends ASTNode {
	axis: Axis;
	theta: number;
}

interface ScaleNode extends ASTNode {
	s: number[];
}

interface MatrixNode extends ASTNode {
	m: number[];
}

interface SynthFrame {
	rule: string;
	depth: number;
	geospace: Float32Array;
	colorspace: Float32Array;
}

class Synthesizer {

	public constructor(script : string) {
		// TODO: seed RNG ?
		this.ast = <ASTNode[]>eisenscript.parse(script);
		this.index = Synthesizer.indexRules(this.ast);
	}

	private static indexRules(ast: ASTNode[]): collections.Dictionary<string, [number, DefStatement[]]> {		
		var index = new collections.Dictionary<string, [number, DefStatement[]]>();
		for (var si = 0; si < ast.length; ++si) {
			if (ast[si].type == "def") {
				var def = <DefStatement>ast[si];
				var wclauses = index.getValue(def.rule);
				if (!wclauses) {
					wclauses = [0, []];
					index.setValue(def.rule, wclauses);
				}
				wclauses[0] += def.weight;
				wclauses[1].push(def);
			}
		}
		index.forEach(function(rule: string, wclauses: [number, DefStatement[]]): void {
			wclauses[1].sort(function(left: DefStatement, right: DefStatement): number {
				return left.weight - right.weight;
			});
		});		
		return index;
	}

	private pickClause(rule: string): DefStatement {
		var wclauses = this.index.getValue(rule);
		var guess = wclauses[0] * Math.random();
		for (var ci = 0; ci < wclauses[1].length; ++ci) {
			var clause = wclauses[1][ci];
			guess -= clause.weight;
			if (guess < 0) {
				return clause;
			}
		}		
	}

	public synthesize(): ShapeInstance[] {

		var shapes = new Array<ShapeInstance>();
				
		for (var si = 0; si < this.ast.length; ++si) {
			switch (this.ast[si].type) {
				case "invoc":	
					this.synthesizeOne(<InvocStatement>this.ast[si], shapes);
					break;
				case "set":
					// TODO
					break;
			}
		}
		
		console.log("Generated %d shapes.", shapes.length);		
		
		return shapes;
	}

	private synthesizeOne(prod: InvocStatement, shapes: ShapeInstance[]) : void {
	
		var stack = new collections.Stack<SynthFrame>();

		this.synthProduction(prod, 0, glmat.mat4.create(), glmat.mat4.create(), stack, shapes);
		
		while (!stack.isEmpty()) {

			if (shapes.length >= this.maxObjects) {
				console.log("max objects reached");
				break;
			}

			// TODO: Report progress here

			// stack.size() isn't the depth
			if (stack.size() >= this.maxDepth) {
				continue;
			}

			var {rule, depth, geospace, colorspace} = stack.pop();

			var clause = this.pickClause(rule);

			var localMaxDepth = clause.maxdepth;
			if (localMaxDepth >= 0 && depth >= localMaxDepth) {
				if (clause.failover) {
					stack.push({ rule: clause.failover, depth: 0, geospace, colorspace });
				}
				continue;
			}

			for (var pi = 0; pi < clause.production.length; ++pi) {

				// TODO: double check geospace & colorspace are unchanged between calls, take a copy if needed

				this.synthProduction(clause.production[pi], depth + 1, geospace, colorspace, stack, shapes);
			}
		}
	}

	private synthProduction(prod: InvocStatement, 
						depth: number, 
						geospace: Float32Array, 
						colorspace: Float32Array, 
						stack: collections.Stack<SynthFrame>, 
						shapes: ShapeInstance[]) : void {

		var [childGeospaces, childColorspaces] = this.transform(prod.transformations, geospace, colorspace);

		console.assert(childGeospaces.length == childColorspaces.length);

		switch (prod.next.type) {
			case "shape":
				for (var mi = 0; mi < childGeospaces.length; ++mi) {
					shapes.push({ shape: prod.next.name, geospace: childGeospaces[mi], colorspace: childColorspaces[mi] });
				}
				break;
			case "call":
				for (var mi = 0; mi < childGeospaces.length; ++mi) {
					stack.push({ rule: prod.next.name, depth, geospace: childGeospaces[mi], colorspace: childColorspaces[mi] });
				}
				break;
		}
	}

	private transform(transforms: Transformation[], geospace: Float32Array, colorspace: Float32Array): [Float32Array[], Float32Array[]] {
				
		var childGeospaces = new Array<Float32Array>();
		var childColorspaces = new Array<Float32Array>();

		var stack = new collections.Stack<[number, Float32Array, Float32Array]>();
		stack.push([0, geospace, colorspace]);
		while (!stack.isEmpty()) {
			var [ti, childGeospace, childColorSpace] = stack.pop();
			if (ti < transforms.length) {
				var trans = transforms[ti];
				for (var repeat = 0; repeat < trans.multiplier; ++repeat) {
					var [childGeospace, childColorSpace] = this.transformOne(transforms[ti].sequence, childGeospace, childColorSpace);
					stack.push([ti + 1, childGeospace, childColorSpace]);
				}
			} else {
				childGeospaces.push(childGeospace);
				childColorspaces.push(childColorSpace);
			} 			
		};

		return [childGeospaces, childColorspaces];
	}

	private transformOne(sequence: ASTNode[], geospace: Float32Array, colorspace: Float32Array): [Float32Array, Float32Array] {

		var childGeospace = new Float32Array(geospace);
		var childColorspace = new Float32Array(colorspace);

		for (var si = 0; si < sequence.length; ++si) {
			switch (sequence[si].type) {
				case "trans":
					var trans = <TransNode>sequence[si];
					glmat.mat4.translate(childGeospace, childGeospace, trans.t);
					break;
				case "rot":
					var rot = <RotNode>sequence[si];
					var thetaRad = rot.theta * Math.PI / 180
					switch (rot.axis) {
						case Axis.X:
							glmat.mat4.rotateX(childGeospace, childGeospace, thetaRad);
							break;
						case Axis.Y:
							glmat.mat4.rotateY(childGeospace, childGeospace, thetaRad);
							break;
						case Axis.Z:
							glmat.mat4.rotateZ(childGeospace, childGeospace, thetaRad);
							break;
					}
					break;
				case "scale":
					var scale = <ScaleNode>sequence[si];
					glmat.mat4.scale(childGeospace, childGeospace, scale.s);
					break;
				case "matrix":
					var matrix = <MatrixNode>sequence[si];

					var m = [matrix.m[0], matrix.m[1], matrix.m[2], 0, 
							matrix.m[3], matrix.m[4], matrix.m[5], 0,
							matrix.m[6], matrix.m[7], matrix.m[8], 0,
							0, 0, 0, 1];

					glmat.mat4.multiply(childGeospace, childGeospace, m);
					break;
				// TODO colorspace			
			}
		}

		return [childGeospace, childColorspace];
	}

	private ast: ASTNode[];
	private maxObjects: number;
	private maxDepth: number;
	private index: collections.Dictionary<string, [number, DefStatement[]]>;
}
export = Synthesizer;